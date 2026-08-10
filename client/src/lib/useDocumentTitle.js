import { useEffect } from 'react';

const SITE_NAME = 'Pomperaug Panthers — Florida Swim Trip';

/** Sets the browser tab title for the page, reverting to the site default on unmount. */
export function useDocumentTitle(pageTitle) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
    return () => {
      document.title = SITE_NAME;
    };
  }, [pageTitle]);
}
