import { useEffect } from "react";

/** 设置浏览器标签页标题，格式为 "文语校对 - 页面名" */
export function usePageTitle(page: string) {
  useEffect(() => {
    document.title = `文语校对 - ${page}`;
  }, [page]);
}
