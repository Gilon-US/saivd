/** CSS selector for server-rendered public watch `<video>` elements. */
export function ssrVideoSelector(videoId: string): string {
  return `video[data-saivd-public-video="${CSS.escape(videoId)}"]`;
}
