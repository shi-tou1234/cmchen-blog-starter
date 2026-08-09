import type { Translation } from "@i18n/key";

const translation: Translation = {
    site: {
        title: "我的博客",
    },
    header: {
        home: "首页",
        archive: "归档",
        categories: "分类",
        about: "关于",
        tools: "工具栏",
    },
    cover: {
        title: {
            home: "欢迎来到我的博客",
            archive: "文章归档",
            categories: "文章分类",
            about: "关于",
            tools: "工具栏",
        },
        subTitle: {
            home: "生活多彩！",
            archive: "共 {count} 篇文章",
            about: "",
            tools: "常用工具与站点链接，快速直达",
        }
    },
    toc: "目录",
    pageNavigation: {
        previous: "上一页",
        next: "下一页",
        currentPage: "第 {currentPage} 页，共 {totalPages} 页",
    },
    search: {
        placeholder: "输入关键词开始搜索",
        searching: "搜索中...",
        noresult: "未找到相关结果",
        error: "搜索出现错误，请稍后重试"
    },
    license: {
        author: "作者",
        license: "许可协议",
        publishon: "发布时间"
    },
    readingTime: {
        minutes: "预计阅读 {minutes} 分钟"
    },
    blogNavi: {
        next: "下一篇",
        prev: "上一篇"
    },
}

export default translation;