export type SiteConfig = {
    title: string;
    subTitle: string;

    favicon: string;

    pageSize: number;
    blogNavi: {
        enable: boolean;
    }
}

export type ProfileConfig = {
    avatar: string;
    name: string;
    description: string;
    indexPage?: string;
    startYear: number;
}

export type LicenseConfig = {
	enable: boolean;
	name: string;
	url: string;
};

export type ExternalUrlsConfig = {
	/** GitHub API 根地址（后台用） */
	githubApi: string;
	/** GitHub 仓库（owner/repo），用于评论和提交热力图 */
	githubRepo: string;
	/** Giscus 评论系统 repo-id */
	giscusRepoId: string;
	/** 高德地图行政区划数据 API 根地址 */
	geoDataVBase: string;
	/** 高德地图行政区划数据 API 旧版根地址 */
	geoDataVBaseLegacy: string;
};