import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {InlineOrderEditor} from "./InlineOrderEditor.jsx";

export default async () => {
  render(<InlineOrderEditor />, document.body);
};
