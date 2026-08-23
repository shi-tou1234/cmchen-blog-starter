export interface BlogEntryWithLocaleStatus {
  id: string;
  data: {
    title: string;
    [key: string]: any;
  };
  [key: string]: any;
}
