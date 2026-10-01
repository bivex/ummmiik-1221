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
 * Reference consumer for the Song language.
 *
 * Walks a parsed {@code .song} file and emits a structured JSON timeline/arrangement.
 * Resolves constants, chords, lyrics, sections (verses, choruses, bridges, etc.),
 * and timing in bars or seconds.
 */
@SuppressWarnings("unchecked")
public class SongToJson extends SongBaseListener {

    // File-scoped constant table: name -> its value parse-tree node.
    private final Map<String, SongParser.ValueContext> defines = new LinkedHashMap<>();
    private final List<Object> songs = new ArrayList<>();

    private final Deque<Map<String, Object>> songStack = new ArrayDeque<>();
    private Map<String, Object> curSong;
    private Map<String, Object> curSection;
    private int metaDepth;   // counter for nested meta blocks

    /* ───────────────────────── defines ───────────────────────── */

    @Override
    public void enterDefineDecl(SongParser.DefineDeclContext ctx) {
        defines.put(ctx.propertyKey().getText(), ctx.value()); // last write wins
    }

    /* ───────────────────────── songs ────────────────────────── */

    @Override
    public void enterSongDecl(SongParser.SongDeclContext ctx) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("kind", ctx.songKind().getText());
        s.put("title", ctx.STRING() != null ? unquote(ctx.STRING().getText()) : null);
        s.put("meta", new LinkedHashMap<String, List<Object>>());
        s.put("props", new LinkedHashMap<String, List<Object>>());
        s.put("sections", new ArrayList<Object>());
        curSong = s;
        songStack.push(s);
    }

    @Override
    public void exitSongDecl(SongParser.SongDeclContext ctx) {
        songStack.pop();
        songs.add(curSong);
        curSong = songStack.peekFirst();
    }

    /* ───────────────────────── meta blocks ───────────────────── */

    @Override public void enterMetaBlock(SongParser.MetaBlockContext ctx) { metaDepth++; }
    @Override public void exitMetaBlock(SongParser.MetaBlockContext ctx)  { metaDepth--; }

    /* ───────────────────────── sections ──────────────────────── */

    @Override
    public void enterSectionDecl(SongParser.SectionDeclContext ctx) {
        Map<String, Object> s = new LinkedHashMap<>();
        String kind = ctx.sectionKind().getText();
        s.put("type", kind);
        s.put("name", ctx.STRING() != null ? unquote(ctx.STRING().getText()) : capitalize(kind));
        s.put("timing", null);
        s.put("props", new LinkedHashMap<String, List<Object>>());
        curSection = s;
    }

    @Override
    public void exitSectionDecl(SongParser.SectionDeclContext ctx) {
        curSection.put("timing", timingOf(ctx));
        if (curSong != null) {
            List<Object> sections = (List<Object>) curSong.get("sections");
            sections.add(curSection);
        }
        curSection = null;
    }

    /* ───────────────────────── properties ────────────────────── */

    @Override
    public void enterProperty(SongParser.PropertyContext ctx) {
        if (curSong == null && curSection == null) return; // bare top-level property: ignore
        String key = ctx.propertyKey().getText();
        List<Object> vals = new ArrayList<>();
        for (SongParser.ValueContext vc : ctx.value()) vals.add(toJson(vc, new HashSet<>()));

        Map<String, List<Object>> target = (Map<String, List<Object>>)
            (curSection != null ? curSection.get("props")
             : metaDepth > 0 ? curSong.get("meta")
             : curSong.get("props"));
        // accumulate duplicate keys in source order
        target.merge(key, vals, (a, b) -> { a.addAll(b); return a; });
    }

    /* ───────────────── value → JSON model ────────────────────── */

    private Object toJson(SongParser.ValueContext vc, Set<String> seen) {
        Object base = primaryToJson(vc.primary(), seen);
        if (vc.tags() != null) { // trailing #style tags
            List<Object> tagList = new ArrayList<>();
            for (var t : vc.tags().TAG()) tagList.add(t.getText().substring(1));
            Map<String, Object> wrapped = new LinkedHashMap<>();
            wrapped.put("value", base);
            wrapped.put("tags", tagList);
            return wrapped;
        }
        return base;
    }

    private Object primaryToJson(SongParser.PrimaryContext p, Set<String> seen) {
        if (p instanceof SongParser.MultilinePrimaryContext c) {
            return unquoteMultiline(c.MULTILINE_STRING().getText());
        }
        if (p instanceof SongParser.StringPrimaryContext c) {
            Object s = unquote(c.STRING().getText());
            return c.byClause() != null ? attributed(s, c.byClause(), seen) : s;
        }
        if (p instanceof SongParser.TimeSignaturePrimaryContext c) return c.TIME_SIGNATURE().getText();
        if (p instanceof SongParser.DurationPrimaryContext c)      return c.DURATION().getText();
        if (p instanceof SongParser.ChordPrimaryContext c)         return c.CHORD().getText();
        if (p instanceof SongParser.BoolPrimaryContext c)          return Boolean.parseBoolean(c.BOOL().getText());
        if (p instanceof SongParser.NumberPrimaryContext c)        return number(c.NUMBER().getText());
        if (p instanceof SongParser.ReferencePrimaryContext c)     return resolveRef(c.REFERENCE().getText(), seen);
        if (p instanceof SongParser.TagPrimaryContext c) {
            List<Object> tags = new ArrayList<>();
            for (var t : c.TAG()) tags.add(t.getText().substring(1));
            return tags;
        }
        if (p instanceof SongParser.ListPrimaryContext c) {
            List<Object> items = new ArrayList<>();
            if (c.list().value() != null) {
                for (var item : c.list().value()) items.add(toJson(item, seen));
            }
            return items;
        }
        if (p instanceof SongParser.KeywordPrimaryContext c) {
            return c.byClause() != null ? attributed(c.keyword().getText(), c.byClause(), seen)
                                        : c.keyword().getText();
        }
        if (p instanceof SongParser.IdentPrimaryContext c) {
            Object s = c.IDENT().getText();
            return c.byClause() != null ? attributed(s, c.byClause(), seen) : s;
        }
        return null;
    }

    /** Builds {"value": v, "by": author} for a `by` attribution clause. */
    private Object attributed(Object value, SongParser.ByClauseContext by, Set<String> seen) {
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

    private Object timingOf(SongParser.SectionDeclContext ctx) {
        var st = ctx.sectionTiming();
        if (st == null) return null;
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

    private Object timePointText(SongParser.TimePointContext tp) {
        if (tp.DURATION() != null)  return tp.DURATION().getText();
        if (tp.NUMBER() != null)    return tp.NUMBER().getText();
        if (tp.REFERENCE() != null) return resolveRef(tp.REFERENCE().getText(), new HashSet<>());
        return null;
    }

    private Object durText(SongParser.DurationContext d) {
        if (d.DURATION() != null)   return d.DURATION().getText();
        if (d.NUMBER() != null)     return d.NUMBER().getText();
        if (d.REFERENCE() != null)  return resolveRef(d.REFERENCE().getText(), new HashSet<>());
        return null;
    }

    /* ───────────────────────── helpers ───────────────────────── */

    private static String unquote(String s) {
        if (s == null || s.length() < 2) return s;
        return s.substring(1, s.length() - 1)
                .replace("\\\"", "\"").replace("\\'", "'")
                .replace("\\\\", "\\").replace("\\n", "\n").replace("\\t", "\t");
    }

    private static String unquoteMultiline(String s) {
        if (s == null || s.length() < 6) return s;
        String content = s.substring(3, s.length() - 3);
        // Strip initial newline if present
        if (content.startsWith("\r\n")) content = content.substring(2);
        else if (content.startsWith("\n")) content = content.substring(1);
        // Strip trailing spaces/newline
        if (content.endsWith("\r\n")) content = content.substring(0, content.length() - 2);
        else if (content.endsWith("\n")) content = content.substring(0, content.length() - 1);
        return content.stripIndent();
    }

    private static String capitalize(String str) {
        if (str == null || str.isEmpty()) return str;
        return Character.toUpperCase(str.charAt(0)) + str.substring(1).replace('_', ' ');
    }

    private static Object number(String text) {
        try {
            return text.contains(".") ? (Object) Double.parseDouble(text) : (Object) Long.parseLong(text);
        } catch (NumberFormatException e) {
            return text;
        }
    }

    private static Map<String, Object> collapseProps(Map<String, List<Object>> props) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (var e : props.entrySet()) {
            List<Object> vals = e.getValue();
            out.put(e.getKey(), vals.size() == 1 ? vals.get(0) : vals);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> finalizeSong(Map<String, Object> s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", s.get("kind"));
        out.put("title", s.get("title"));
        out.put("meta", collapseProps((Map<String, List<Object>>) s.get("meta")));
        out.put("props", collapseProps((Map<String, List<Object>>) s.get("props")));
        List<Object> sections = new ArrayList<>();
        for (Object sec : (List<Object>) s.get("sections")) {
            Map<String, Object> sm = (Map<String, Object>) sec;
            Map<String, Object> so = new LinkedHashMap<>();
            so.put("type", sm.get("type"));
            so.put("name", sm.get("name"));
            so.put("timing", sm.get("timing"));
            so.put("props", collapseProps((Map<String, List<Object>>) sm.get("props")));
            sections.add(so);
        }
        out.put("sections", sections);
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
        if (o instanceof String s) {
            sb.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\n' -> sb.append("\\n");
                    case '\t' -> sb.append("\\t");
                    case '\r' -> sb.append("\\r");
                    default -> {
                        if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                        else sb.append(c);
                    }
                }
            }
            sb.append('"');
            return;
        }
        if (o instanceof Boolean || o instanceof Number) {
            sb.append(o);
            return;
        }
        if (o instanceof Map<?, ?> m) {
            sb.append('{');
            boolean first = true;
            for (var e : m.entrySet()) {
                if (!first) sb.append(", ");
                first = false;
                sb.append('"').append(e.getKey()).append("\": ");
                write(e.getValue(), sb);
            }
            sb.append('}');
            return;
        }
        if (o instanceof List<?> l) {
            sb.append('[');
            boolean first = true;
            for (var x : l) {
                if (!first) sb.append(", ");
                first = false;
                write(x, sb);
            }
            sb.append(']');
            return;
        }
        sb.append('"').append(o).append('"');
    }

    /* ─────────────────────────── main ────────────────────────── */

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: SongToJson <file.song>");
            System.exit(2);
        }
        CharStream input = CharStreams.fromFileName(args[0]);
        SongLexer lex = new SongLexer(input);
        SongParser parser = new SongParser(new CommonTokenStream(lex));
        var tree = parser.program();

        // Two passes so forward $refs resolve correctly
        SongToJson pass1 = new SongToJson();
        ParseTreeWalker.DEFAULT.walk(pass1, tree);
        SongToJson pass2 = new SongToJson();
        pass2.defines.putAll(pass1.defines);
        ParseTreeWalker.DEFAULT.walk(pass2, tree);

        List<Object> out = new ArrayList<>();
        for (Object s : pass2.songs) out.add(finalizeSong((Map<String, Object>) s));
        System.out.println(toJsonString(out));
    }
}
