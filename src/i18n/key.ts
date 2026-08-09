export interface Translation {
    site: {
        title: string;
    };
    header: {
        home: string;
        archive: string;
        categories: string;
        about: string;
        tools: string;
    };
    cover: {
        title: {
            home: string;
            archive: string;
            categories: string;
            about: string;
            tools: string;
        };
        subTitle: {
            home: string;
            archive: string;
            about: string;
            tools: string;
        };
    };
    toc:string;
    pageNavigation: {
        previous: string;
        next: string;
        currentPage: string;
    };
    search: {
        placeholder: string;
        searching: string;
        noresult: string;
        error: string;
    };
    license: {
        author: string;
        license: string;
        publishon: string;
    };
    readingTime: {
        minutes: string;
    };
    blogNavi: {
        next: string;
        prev: string;
    };
}