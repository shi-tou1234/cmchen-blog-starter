import { externalUrlsConfig } from '@/config'

export const SESSION_KEY = "cmchen_admin_ok";
export const ADMIN_GH_TOKEN_KEY = "cmchen_admin_gh_token";
export const ADMIN_GH_TOKEN_REMEMBER_KEY = "cmchen_admin_gh_token_remember";
export const ADMIN_GH_BRANCH_KEY = "cmchen_admin_gh_branch";
export const ADMIN_GH_API_URL_KEY = "cmchen_admin_api_url";
export const ADMIN_PREVIEW_DRAFT_KEY = "cmchen_admin_preview_draft";
export const ADMIN_PREVIEW_RESULT_KEY = "cmchen_admin_preview_result";

export const REPO_OWNER = externalUrlsConfig.githubRepo.split('/')[0];
export const REPO_NAME = externalUrlsConfig.githubRepo.split('/')[1];
export const GITHUB_API_DEFAULT = externalUrlsConfig.githubApi;

export const ADMIN_SECURITY_PATH = "public/admin-security.json";
export const HEADER_CONTACT_PATH = "src/data/header-contact.ts";
export const ABOUT_PROFILE_PATH = "src/data/about-profile.ts";
export const ABOUT_PERSONAL_PATH = "src/data/about-personal.ts";
export const ABOUT_SPEC_PATH_PREFIX = "src/content/spec/about";
export const BLOG_GUIDE_CONTENT_PATH = "src/data/blog-guide-content.ts";
export const SITE_SLOGAN_PATH = "src/data/site-slogan.ts";

export const CATEGORY_OPTIONS_LIMIT = 50;
export const CATEGORY_CACHE_KEY = "cmchen_admin_category_cache";
export const CATEGORY_CACHE_TTL = 3600000;

export const PREVIEW_TOOL_PATH = "admin-preview/index.html";
