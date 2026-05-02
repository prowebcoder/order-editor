import {authenticate} from "../shopify.server";

export const loader = async () =>
  Response.json({ok: true}, {headers: {"Content-Type": "application/json"}});

/**
 * Authenticated multipart upload: Shopify staged upload → fileCreate → Files CDN URL.
 * Same pipeline as Merchant Admin Content → Files; used by Settings → Checkout display.
 */
export const action = async ({request}) => {
  if (request.method !== "POST") {
    return Response.json({ok: false, message: "Method not allowed"}, {status: 405});
  }

  let admin;
  try {
    ({admin} = await authenticate.admin(request));
  } catch {
    return Response.json({ok: false, message: "Not authenticated"}, {status: 401});
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const clientNonce = String(formData.get("clientNonce") ?? "");

  if (!file || typeof file === "string") {
    return Response.json({ok: false, message: "Choose an image file first.", clientNonce}, {status: 400});
  }

  const MAX_BYTES = 20 * 1024 * 1024;
  if (typeof file.size === "number" && file.size > MAX_BYTES) {
    return Response.json({ok: false, message: "File is too large (max 20 MB).", clientNonce}, {status: 400});
  }

  const filename =
    typeof file.name === "string" && file.name.length > 0 ? file.name : `checkout-display-${Date.now()}.jpg`;
  const mimeType = file.type || "application/octet-stream";

  if (!mimeType.startsWith("image/")) {
    return Response.json({ok: false, message: "Only image files are allowed.", clientNonce}, {status: 400});
  }

  try {
  const stagedRes = await admin.graphql(
    `#graphql
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        input: [{resource: "IMAGE", filename, mimeType, httpMethod: "POST"}],
      },
    },
  );

  const stagedJson = await stagedRes.json();
  if (stagedJson.errors?.length) {
    return Response.json(
      {
        ok: false,
        message: stagedJson.errors.map((e) => e.message).join("; "),
        clientNonce,
      },
      {status: 400},
    );
  }
  const stagedErrors = stagedJson?.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length) {
    return Response.json(
      {ok: false, message: stagedErrors.map((e) => e.message).join(", "), clientNonce},
      {status: 400},
    );
  }

  const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) {
    return Response.json({ok: false, message: "Could not prepare upload.", clientNonce}, {status: 500});
  }

  const uploadForm = new FormData();
  for (const p of target.parameters || []) {
    uploadForm.append(p.name, p.value);
  }
  uploadForm.append("file", file);

  const uploadResp = await fetch(target.url, {method: "POST", body: uploadForm});

  if (!uploadResp.ok) {
    const text = await uploadResp.text().catch(() => "");
    return Response.json(
      {ok: false, message: `Upload failed (${uploadResp.status}).`, detail: text.slice(0, 500), clientNonce},
      {status: 502},
    );
  }

  const createRes = await admin.graphql(
    `#graphql
      mutation FileCreateCheckoutDisplay($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            __typename
            ... on MediaImage {
              image {
                url
              }
            }
            ... on GenericFile {
              url
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        files: [
          {
            originalSource: target.resourceUrl,
            contentType: "IMAGE",
            alt: "Checkout display (Order Editor app)",
            filename,
          },
        ],
      },
    },
  );

  const createJson = await createRes.json();
  if (createJson.errors?.length) {
    return Response.json(
      {
        ok: false,
        message: createJson.errors.map((e) => e.message).join("; "),
        clientNonce,
      },
      {status: 400},
    );
  }
  const createErrors = createJson?.data?.fileCreate?.userErrors ?? [];
  if (createErrors.length) {
    return Response.json(
      {ok: false, message: createErrors.map((e) => e.message).join(", "), clientNonce},
      {status: 400},
    );
  }

  const created = createJson?.data?.fileCreate?.files?.[0];
  let url = created?.image?.url ?? created?.url;

  if (!url && created?.id) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((r) => setTimeout(r, 750));
      const pollRes = await admin.graphql(
        `#graphql
          query PollMerchImage($id: ID!) {
            node(id: $id) {
              ... on MediaImage {
                image {
                  url
                }
              }
            }
          }`,
        {variables: {id: created.id}},
      );
      const pollJson = await pollRes.json();
      const polledUrl = pollJson?.data?.node?.image?.url;
      if (polledUrl) {
        url = polledUrl;
        break;
      }
    }
  }

  if (!url) {
    return Response.json(
      {
        ok: false,
        message: "Shopify accepted the file but the CDN URL was not ready. Wait a moment and upload again.",
        clientNonce,
      },
      {status: 502},
    );
  }

  return Response.json({ok: true, url, clientNonce});
  } catch (error) {
    const msg = String(error?.message || error || "Upload failed");
    if (/write_files|write_images|fileCreate|Access denied/i.test(msg)) {
      return Response.json(
        {
          ok: false,
          clientNonce,
          message:
            "Install needs Files access (write_files). Reload this app from the Shopify admin menu and approve the new scopes, or uninstall and reinstall Order Editor once, then retry upload.",
        },
        {status: 403},
      );
    }
    return Response.json({ok: false, clientNonce, message: msg.slice(0, 500)}, {status: 502});
  }
};
