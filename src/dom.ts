type Props = {
  className?: string;
  text?: string;
  onClick?: () => void;
  attrs?: Record<string, string>;
};

/** Tiny DOM helper: text goes through textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.onClick) node.addEventListener("click", props.onClick);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
