import {redirect} from "react-router";

/** Legacy route — Pricing lives at `/app/pricing` (aligned with other PWC apps). */
export function loader() {
  return redirect("/app/pricing");
}

export default function LegacyPaymentsRedirect() {
  return null;
}
