import {unauthenticated} from "../shopify.server";
import {getSettings} from "../services/orderflex-settings.server";

async function adminGraphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, {variables});
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

export const loader = async ({request}) => {
  const url = new URL(request.url);
  const shop = String(url.searchParams.get("shop") || "").trim();
  if (!shop) {
    return toJson({ok: false, message: "Missing shop"}, 400);
  }

  try {
    const {admin} = await unauthenticated.admin(shop);
    const settings = await getSettings(shop);

    const productsById = new Map();

    if (settings.upsellCollectionIds?.length) {
      const collectionData = await adminGraphql(
        admin,
        `#graphql
        query CollectionUpsells($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Collection {
              id
              title
              products(first: 25, sortKey: BEST_SELLING) {
                nodes {
                  id
                  title
                  featuredMedia {
                    ... on MediaImage {
                      image { url }
                    }
                  }
                  variants(first: 50) {
                    nodes {
                      id
                      title
                      availableForSale
                      price
                    }
                  }
                }
              }
            }
          }
        }`,
        {ids: settings.upsellCollectionIds},
      );
      for (const node of collectionData.nodes || []) {
        for (const p of node?.products?.nodes || []) {
          if (p?.id) productsById.set(p.id, p);
        }
      }
    }

    if (settings.upsellProductIds?.length) {
      const productData = await adminGraphql(
        admin,
        `#graphql
        query ProductUpsells($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredMedia {
                ... on MediaImage {
                  image { url }
                }
              }
              variants(first: 50) {
                nodes {
                  id
                  title
                  availableForSale
                  price
                }
              }
            }
          }
        }`,
        {ids: settings.upsellProductIds},
      );
      for (const node of productData.nodes || []) {
        if (node?.id) productsById.set(node.id, node);
      }
    }

    const products = Array.from(productsById.values())
      .map((p) => ({
        id: p.id,
        title: p.title || "Product",
        image: p.featuredMedia?.image?.url || "",
        variants: (p.variants?.nodes || [])
          .filter((v) => v?.id && v.availableForSale)
          .map((v) => ({
            id: v.id,
            title: v.title || "Default",
            price: v.price || "",
          })),
      }))
      .filter((p) => p.variants.length > 0);

    return toJson({
      ok: true,
      settings: {
        enableUpsells: Boolean(settings.enableUpsells),
        allowProductEdit: Boolean(settings.allowProductEdit),
        checkoutOfferHeading: settings.checkoutOfferHeading || "Add the finishing touch",
      },
      products,
    });
  } catch (error) {
    return toJson({ok: false, message: String(error)}, 500);
  }
};

function toJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
