from __future__ import annotations

from html import escape
from pathlib import Path


ASSET_VERSION_TOKENS = {
    "{{SITE_CSS_VERSION}}": Path("css/site.css"),
    "{{EXHIBITION_JS_VERSION}}": Path("js/exhibition.js"),
    "{{ADMIN_CSS_VERSION}}": Path("css/admin.css"),
    "{{ADMIN_JS_VERSION}}": Path("js/admin.js"),
    "{{BGM_VERSION}}": Path("audio/moment-bgm.mp3"),
}


def asset_version(file_path: Path) -> str:
    stat = file_path.stat()
    return f"{stat.st_mtime_ns:x}-{stat.st_size:x}"


def _build_site_meta_tags(public_url: str | None) -> str:
    og_image_path = "/static/og/moment-share.png"
    if public_url:
        og_image_url = f"{public_url}{og_image_path}"
        canonical_line = f'  <link rel="canonical" href="{escape(public_url + "/") if not public_url.endswith("/") else escape(public_url)}">\n'
        og_url_line = f'  <meta property="og:url" content="{escape(public_url + "/") if not public_url.endswith("/") else escape(public_url)}">\n'
    else:
        og_image_url = og_image_path
        canonical_line = ""
        og_url_line = ""

    return (
        f"{og_url_line}"
        f'  <meta property="og:image" content="{escape(og_image_url)}">\n'
        '  <meta property="og:image:alt" content="MoMent">\n'
        '  <meta property="og:image:width" content="1200">\n'
        '  <meta property="og:image:height" content="630">\n'
        f'  <meta name="twitter:image" content="{escape(og_image_url)}">\n'
        f"{canonical_line}"
    )


def render_html_template(template_path: Path, static_dir: Path, *, public_url: str | None = None) -> str:
    html = template_path.read_text(encoding="utf-8")

    for token, relative_path in ASSET_VERSION_TOKENS.items():
        asset_path = static_dir / relative_path
        version = asset_version(asset_path) if asset_path.exists() else "0"
        html = html.replace(token, version)

    html = html.replace("{{SITE_META_TAGS}}", _build_site_meta_tags(public_url))
    return html
