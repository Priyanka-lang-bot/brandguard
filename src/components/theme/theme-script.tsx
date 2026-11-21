/**
 * Runs before first paint (inline, first element of <body>) so the page never flashes the wrong theme. Dark is the default;
 * a saved choice ("light" | "dark") in localStorage wins. The CSS treats <html> without data-theme="light" as
 * dark, so a visitor who never chose sees dark from the first byte, even with JavaScript off.
 */
export const THEME_KEY = "bg-theme";
// After applying the theme it keeps watching <html>: if React ever re-creates the root element's attributes (it
// does when it recovers from a hydration error by re-rendering on the client), the saved theme is put back
// instead of silently falling back to dark.
const code = `(function(){try{var k="${THEME_KEY}",d=document.documentElement;var want=function(){var t=localStorage.getItem(k);return t==="light"||t==="dark"?t:"dark";};var set=function(){var t=want();if(d.getAttribute("data-theme")!==t)d.setAttribute("data-theme",t);};set();new MutationObserver(set).observe(d,{attributes:true,attributeFilter:["data-theme"]});}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
