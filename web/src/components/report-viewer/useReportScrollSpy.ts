import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReportOutlineItem } from '@shared/report-bundle';

export function useReportScrollSpy(
  outline: ReportOutlineItem[],
  scrollRoot: HTMLElement | null,
  appendixId = 'appendix',
) {
  const allIds = useMemo(() => {
    const ids = outline.filter(item => item.level >= 2).map(item => item.id);
    ids.push(appendixId);
    return ids;
  }, [outline, appendixId]);

  const initialId = useMemo(
    () => outline.find(item => item.level === 2)?.id ?? appendixId,
    [outline, appendixId],
  );

  const [activeId, setActiveId] = useState(initialId);

  useEffect(() => {
    setActiveId(initialId);
  }, [initialId]);

  useEffect(() => {
    if (!scrollRoot) return;

    const headings = allIds
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        root: scrollRoot,
        rootMargin: '-12% 0px -70% 0px',
        threshold: [0, 0.1, 0.25, 0.5, 1],
      },
    );

    headings.forEach(heading => observer.observe(heading));
    return () => observer.disconnect();
  }, [scrollRoot, allIds]);

  const scrollTo = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target || !scrollRoot) return;
    setActiveId(id);
    const containerTop = scrollRoot.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    const nextTop = scrollRoot.scrollTop + (targetTop - containerTop) - 16;
    scrollRoot.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
  }, [scrollRoot]);

  const activeItem = useMemo(
    () => outline.find(item => item.id === activeId),
    [outline, activeId],
  );

  return { activeId, activeItem, scrollTo };
}
