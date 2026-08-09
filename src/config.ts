import type {
    SiteConfig,
    ProfileConfig,
    LicenseConfig,
    ExternalUrlsConfig
} from "./types/config"

export const siteConfig: SiteConfig = {
    title: "我的博客",
    subTitle: "记录生活与学习",

    favicon: "/favicon/favicon.ico", // Path of the favicon, relative to the /public directory

    pageSize: 6, // Number of posts per page
    blogNavi: {
        enable: true // Whether to enable blog navigation in the blog footer
    }
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/Motues.jpg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    name: "你的名字",
    description: "写一句介绍自己的话",
    indexPage: "https://shi-tou1234.github.io/cmchen-blog-starter/",
    startYear: 2026,
}

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const externalUrlsConfig: ExternalUrlsConfig = {
	githubApi: "https://api.github.com",
	githubRepo: "shi-tou1234/cmchen-blog-starter",
	giscusRepoId: "",
	geoDataVBase: "https://geo.datav.aliyun.com/areas_v3/bound",
	geoDataVBaseLegacy: "https://geo.datav.aliyun.com/areas/bound",
};
