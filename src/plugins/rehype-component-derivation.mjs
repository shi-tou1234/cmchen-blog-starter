/// <reference types="mdast" />
import { h } from "hastscript";

/**
 * 创建推导/图解组件。
 *
 * 作者在公式后紧跟 `:::derivation ... :::` 容器，
 * 渲染为隐藏的 div，由客户端脚本自动绑定到前一个公式节点，
 * hover（桌面）/ click（移动端）时弹出。
 *
 * @param {Object} properties - 容器属性。
 * @param {import('mdast').RootContent[]} children - 子元素。
 * @returns {import('mdast').Parent} 推导块节点。
 */
export function DerivationComponent(properties, children) {
	if (!Array.isArray(children) || children.length === 0)
		return h(
			"div",
			{ class: "hidden" },
			'Invalid derivation directive. (derivation directives must be of block type ":::derivation <content> :::")',
		);

	let body = children;
	if (properties?.["has-directive-label"]) {
		body = children.slice(1);
	}

	return h("div", { class: "derivation-block", hidden: true, "aria-hidden": "true" }, body);
}
