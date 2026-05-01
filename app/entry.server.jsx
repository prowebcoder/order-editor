import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  allowEmbeddedOrderEdit(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}

/**
 * Lets the storefront theme embed the customer order-edit page in an iframe.
 * Shopify app defaults often block framing; we relax that only for /order-edit?embed=1.
 */
function allowEmbeddedOrderEdit(request, responseHeaders) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    const isOrderEdit = path.startsWith("/order-edit/");
    const isEmbed =
      url.searchParams.get("embed") === "1" ||
      url.searchParams.get("embedded") === "1";
    if (!isOrderEdit || !isEmbed) return;

    responseHeaders.delete("X-Frame-Options");

    const shop = String(url.searchParams.get("shop") || "").trim();
    const origins = [];
    if (shop) origins.push(`https://${shop}`);

    const frameParent = String(url.searchParams.get("frame_parent") || "").trim();
    if (frameParent) {
      try {
        const parsed = new URL(frameParent);
        if (parsed.protocol === "https:") origins.push(parsed.origin);
      } catch {
        // ignore malformed frame_parent
      }
    }

    const uniq = [...new Set(origins.filter(Boolean))];
    if (!uniq.length) return;

    const existing = responseHeaders.get("Content-Security-Policy") || "";
    const withoutFrameAncestors = existing
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.length && !d.toLowerCase().startsWith("frame-ancestors"));

    const next = [`frame-ancestors ${uniq.join(" ")}`, ...withoutFrameAncestors]
      .filter(Boolean)
      .join("; ")
      .trim();

    responseHeaders.set("Content-Security-Policy", next);
  } catch {
    // ignore
  }
}
