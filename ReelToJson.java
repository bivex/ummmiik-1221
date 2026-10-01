import org.antlr.v4.runtime.CharStream;
import org.antlr.v4.runtime.CharStreams;
import org.antlr.v4.runtime.CommonTokenStream;
import org.antlr.v4.runtime.tree.ParseTreeWalker;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Reference consumer for the Reel language.
 *
 * Walks a parsed {@code .reel} file and emits a JSON timeline. It is also a
 * worked example of the semantics the grammar deliberately leaves open:
 *
 *   • define scope  — constants are file-scoped; the LAST definition of a
 *                      name wins; references are resolved after the whole
 *                      file is parsed, so forward references are allowed.
 *   • duplicate keys — repeated keys in one block ACCUMULATE into an ordered
 *                      list (e.g. several {@code text:} properties become
 *                      layered overlays). A key used once collapses to a scalar.
 *   • timing         — scenes carry {start,end} | {duration} | null (ordered).
 *
 * Build: see `make json`.
 */
@SuppressWarnings("unchecked")
public class ReelToJson extends ReelBaseListener {

    // File-scoped constant table: name -> its value parse-tree node.
    private final Map<String, ReelParser.ValueContext> defines = new LinkedHashMap<>();
    private final List<Object> videos = new ArrayList<>();

    private final Deque<Map<String, Object>> videoStack = new ArrayDeque<>();
    private Map<String, Object> curVideo;
    private Map<String, Object> curScene;
    private int metaDepth;   // counter (not a flag) so nested meta blocks work

    /* ───────────────────────── defines ───────────────────────── */

    @Override
    public void enterDefineDecl(ReelParser.DefineDeclContext ctx) {
        defines.put(ctx.IDENT().getText(), ctx.value()); // last write wins
    }

    /* ───────────────────────── videos ────────────────────────── */

    @Override
    public void enterVideoDecl(ReelParser.VideoDeclContext ctx) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("kind", ctx.videoKind().getText());
        v.put("title", ctx.STRING() != null ? unquote(ctx.STRING().getText()) : null);
        v.put("meta", new LinkedHashMap<String, List<Object>>());
        v.put("props", new LinkedHashMap<String, List<Object>>());
        v.put("scenes", new ArrayList<Object>());
        curVideo = v;
        videoStack.push(v);
    }

    @Override
    public void exitVideoDecl(ReelParser.VideoDeclContext ctx) {
        videoStack.pop();
        videos.add(curVideo);
        curVideo = videoStack.peekFirst();
    }

    /* ───────────────────────── meta blocks ───────────────────── */

    @Override public void enterMetaBlock(ReelParser.MetaBlockContext ctx) { metaDepth++; }
    @Override public void exitMetaBlock(ReelParser.MetaBlockContext ctx)  { metaDepth--; }

    /* ───────────────────────── scenes ────────────────────────── */

    @Override
    public void enterSceneDecl(ReelParser.SceneDeclContext ctx) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("name", ctx.STRING() != null ? unquote(ctx.STRING().getText()) : null);
        s.put("timing", null);
        s.put("props", new LinkedHashMap<String, List<Object>>());
        curScene = s;
    }

    @Override
    public void exitSceneDecl(ReelParser.SceneDeclContext ctx) {
        curScene.put("timing", timingOf(ctx));
        @SuppressWarnings("unchecked")
        List<Object> scenes = (List<Object>) curVideo.get("scenes");
        scenes.add(curScene);
        curScene = null;
    }

    /* ───────────────────────── properties ────────────────────── */

    @Override
    public void enterProperty(ReelParser.PropertyContext ctx) {
        if (curVideo == null) return; // bare top-level property: ignore
        String key = ctx.IDENT().getText();
        List<Object> vals = new ArrayList<>();
        for (ReelParser.ValueContext vc : ctx.value()) vals.add(toJson(vc, new HashSet<>()));

        @SuppressWarnings("unchecked")
        Map<String, List<Object>> target = (Map<String, List<Object>>)
            (curScene != null ? curScene.get("props")
             : metaDepth > 0 ? curVideo.get("meta")
             : curVideo.get("props"));
        // accumulate duplicates in source order
        target.merge(key, vals, (a, b) -> { a.addAll(b); return a; });
    }

    /* ───────────────── value → JSON model ────────────────────── */

    private Object toJson(ReelParser.ValueContext vc, Set<String> seen) {
        Object base = primaryToJson(vc.primary(), seen);
        if (vc.tags() != null) {                       // trailing #style tags
            List<Object> tagList = new ArrayList<>();
            for (var t : vc.tags().TAG()) tagList.add(t.getText().substring(1));
            Map<String, Object> wrapped = new LinkedHashMap<>();
            wrapped.put("value", base);
            wrapped.put("tags", tagList);
            return wrapped;
        }
        return base;
    }

    private Object primaryToJson(ReelParser.PrimaryContext p, Set<String> seen) {
        if (p instanceof ReelParser.StringPrimaryContext c) {
            Object s = unquote(c.STRING().getText());
            return c.byClause() != null ? attributed(s, c.byClause(), seen) : s;
        }
        if (p instanceof ReelParser.DurationPrimaryContext c)  return c.DURATION().getText();
        if (p instanceof ReelParser.AspectPrimaryContext c)    return c.ASPECT().getText();
        if (p instanceof ReelParser.BoolPrimaryContext c)      return Boolean.parseBoolean(c.BOOL().getText());
        if (p instanceof ReelParser.NumberPrimaryContext c)    return number(c.NUMBER().getText());
        if (p instanceof ReelParser.ReferencePrimaryContext c) return resolveRef(c.REFERENCE().getText(), seen);
        if (p instanceof ReelParser.TagPrimaryContext c) {
            List<Object> tags = new ArrayList<>();
            for (var t : c.TAG()) tags.add(t.getText().substring(1));
            return tags;
        }
        if (p instanceof ReelParser.ListPrimaryContext c) {
            List<Object> items = new ArrayList<>();
            for (var item : c.list().value()) items.add(toJson(item, seen));
            return items;
        }
        if (p instanceof ReelParser.KeywordPrimaryContext c)
            return c.byClause() != null ? attributed(c.keyword().getText(), c.byClause(), seen)
                                        : c.keyword().getText();
        if (p instanceof ReelParser.IdentPrimaryContext c) {
            Object s = c.IDENT().getText();
            return c.byClause() != null ? attributed(s, c.byClause(), seen) : s;
        }
        return null;
    }

    /** Builds {"value": v, "by": author} for a `by` attribution clause. */
    private Object attributed(Object value, ReelParser.ByClauseContext by, Set<String> seen) {
        Object author = by.STRING() != null ? unquote(by.STRING().getText())
                                            : resolveRef(by.REFERENCE().getText(), seen);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("value", value);
        m.put("by", author);
        return m;
    }

    /** Resolves $NAME via the file-scoped define table; recursive with cycle guard. */
    private Object resolveRef(String refText, Set<String> seen) {
        String name = refText.substring(1); // drop leading $
        if (!defines.containsKey(name)) return refText; // unresolved: keep literal
        if (!seen.add(name)) return null;               // cycle: bail
        Object resolved = toJson(defines.get(name), seen);
        seen.remove(name);
        return resolved;
    }

    /* ───────────────── timing extraction ─────────────────────── */

    private Object timingOf(ReelParser.SceneDeclContext ctx) {
        var st = ctx.sceneTiming();
        if (st == null) return null;                   // ordered scene
        if (st.timeRange() != null) {
            var tr = st.timeRange();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("start", timePointText(tr.timePoint(0)));
            m.put("end",   timePointText(tr.timePoint(1)));
            return m;
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("duration", durText(st.duration()));
        return m;
    }

    private Object timePointText(ReelParser.TimePointContext tp) {
        if (tp.DURATION() != null)  return tp.DURATION().getText();
        if (tp.REFERENCE() != null) return resolveRef(tp.REFERENCE().getText(), new HashSet<>());
        return null;
    }

    private Object durText(ReelParser.DurationContext d) {
        if (d.DURATION() != null)   return d.DURATION().getText();
        if (d.REFERENCE() != null)  return resolveRef(d.REFERENCE().getText(), new HashSet<>());
        return null;
    }

    /* ───────────────────────── helpers ───────────────────────── */

    private static String unquote(String s) {
        return s.substring(1, s.length() - 1)            // strip surrounding quotes
                .replace("\\\"", "\"").replace("\\'", "'")
                .replace("\\\\", "\\").replace("\\n", "\n").replace("\\t", "\t");
    }

    private static Object number(String text) {
        try { return text.contains(".") ? (Object) Double.parseDouble(text) : (Object) Long.parseLong(text); }
        catch (NumberFormatException e) { return text; }
    }

    /** Collapse a property's value-list to a scalar when there is exactly
     *  one value (so `text: "x"` → "x", and `tags: #a #b` → ["a","b"]
     *  unwrapped, not [["a","b"]]); several comma-separated values → array.
     *  Structural lists (scenes/videos) are NEVER collapsed — see finalizeVideo. */
    private static Map<String, Object> collapseProps(Map<String, List<Object>> props) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (var e : props.entrySet()) {
            List<Object> vals = e.getValue();
            out.put(e.getKey(), vals.size() == 1 ? vals.get(0) : vals);
        }
        return out;
    }

    /** Finalize a video model: collapse property maps, keep scenes as a list. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> finalizeVideo(Map<String, Object> v) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", v.get("kind"));
        out.put("title", v.get("title"));
        out.put("meta", collapseProps((Map<String, List<Object>>) v.get("meta")));
        out.put("props", collapseProps((Map<String, List<Object>>) v.get("props")));
        List<Object> scenes = new ArrayList<>();
        for (Object s : (List<Object>) v.get("scenes")) {
            Map<String, Object> sm = (Map<String, Object>) s;
            Map<String, Object> so = new LinkedHashMap<>();
            so.put("name", sm.get("name"));
            so.put("timing", sm.get("timing"));
            so.put("props", collapseProps((Map<String, List<Object>>) sm.get("props")));
            scenes.add(so);
        }
        out.put("scenes", scenes);
        return out;
    }

    /* ───────────────────────── JSON writer ───────────────────── */

    public static String toJsonString(Object o) {
        StringBuilder sb = new StringBuilder();
        write(o, sb);
        return sb.toString();
    }

    private static void write(Object o, StringBuilder sb) {
        if (o == null) { sb.append("null"); return; }
        if (o instanceof String s) { sb.append('"'); for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\t' -> sb.append("\\t");
                case '\r' -> sb.append("\\r");
                default -> { if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); }
            }
        } sb.append('"'); return; }
        if (o instanceof Boolean || o instanceof Number) { sb.append(o); return; }
        if (o instanceof Map<?, ?> m) {
            sb.append('{'); boolean first = true;
            for (var e : m.entrySet()) {
                if (!first) sb.append(", "); first = false;
                sb.append('"').append(e.getKey()).append("\": ");
                write(e.getValue(), sb);
            }
            sb.append('}'); return;
        }
        if (o instanceof List<?> l) {
            sb.append('['); boolean first = true;
            for (var x : l) { if (!first) sb.append(", "); first = false; write(x, sb); }
            sb.append(']'); return;
        }
        sb.append('"').append(o).append('"');
    }

    /* ─────────────────────────── main ────────────────────────── */

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: ReelToJson <file.reel>");
            System.exit(2);
        }
        CharStream input = CharStreams.fromFileName(args[0]);
        ReelLexer lex = new ReelLexer(input);
        ReelParser parser = new ReelParser(new CommonTokenStream(lex));
        var tree = parser.program();

        // Two passes so forward $refs resolve correctly: pass 1 collects the
        // full file-scoped define table (every `define`, anywhere in the file);
        // pass 2 builds the model with that table already complete.
        ReelToJson pass1 = new ReelToJson();
        ParseTreeWalker.DEFAULT.walk(pass1, tree);
        ReelToJson pass2 = new ReelToJson();
        pass2.defines.putAll(pass1.defines);
        ParseTreeWalker.DEFAULT.walk(pass2, tree);

        List<Object> out = new ArrayList<>();
        for (Object v : pass2.videos) out.add(finalizeVideo((Map<String, Object>) v));
        System.out.println(toJsonString(out));
    }
}
