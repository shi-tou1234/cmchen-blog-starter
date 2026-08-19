import path from "path"
import type { ImageMetadata } from "astro"

const assetImages = import.meta.glob<ImageMetadata>(
    "../**/*.{png,jpg,jpeg,gif,webp,svg,avif}",
    { import: "default", eager: true }
)

/**
 * 将 src 内的相对资源路径解析为构建后的 URL（与 ImageModule 的解析方式一致）
 * http(s) 与 / 开头的路径原样返回
 */
export function resolveAssetUrl(src: string): string {
    if (!src) return ""
    if (src.startsWith("http") || src.startsWith("/")) return src
    const imagePath = path.normalize(path.join("../", "/", src)).replace(/\\/g, "/")
    return assetImages[imagePath]?.src || src
}
