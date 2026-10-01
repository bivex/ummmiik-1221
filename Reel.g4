/*
 * Reel — a pseudo-language for describing Reels / Shorts / TikTok scenarios.
 *
 * A Reel program describes the structure of a short-form vertical video:
 * its metadata, an ordered list of scenes with timing, and per-scene
 * properties for visuals, narration, on-screen text, audio, transitions
 * and effects.
 *
 * Minimal example:
 *
 *     reel "Hello" {
 *       scene (0s - 3s) { text: "Hi there!" }
 *     }
 *
 * The grammar is intentionally permissive: any IDENT may be used as a
 * property key and any IDENT/keyword/string/duration/number/list/tag may
 * appear as a value, so the vocabulary of transitions, effects, platforms,
 * etc. is open-ended and can grow without touching the grammar.
 */
grammar Reel;

/* ════════════════════════ Parser rules ════════════════════════ */

// A file is a sequence of top-level statements. Typically one or more
// `reel` / `short` / `video` declarations, but bare scenes, properties,
// `define`s and `meta` blocks are also legal (useful for partial files
// and config snippets).
program
    : statement* EOF
    ;

statement
    : videoDecl         // reel "Title" { ... }
    | sceneDecl         // scene "name" (0s - 3s) { ... }
    | metaBlock         // meta { ... }
    | defineDecl        // define MAX_LEN = 60s
    | importDecl        // import "shared.reel"
    | property          // key: value
    ;

// A whole video. `videoKind` selects the platform product; the title is
// optional so you can write `reel { ... }`.
videoDecl
    : videoKind STRING? block
    ;

videoKind
    : REEL
    | SHORT
    | VIDEO
    | TIKTOK
    ;

// A single scene. The name and the timing window are both optional:
//   scene            { ... }          // anonymous, ordered
//   scene "hook"     { ... }          // named
//   scene (3s)       { ... }          // duration only
//   scene (0s - 3s)  { ... }          // explicit start..end
sceneDecl
    : SCENE STRING? sceneTiming? block
    ;

sceneTiming
    : LPAREN (timeRange | duration) RPAREN
    ;

// A start..end window. Either `start - end` or `start .. end`.
timeRange
    : timePoint rangeSep timePoint
    ;

rangeSep
    : MINUS
    | RANGE
    ;

// A point in time on the timeline. A unit is REQUIRED so that bare
// numbers cannot be misread as seconds-vs-frames; use `0s`, not `0`.
// (`$ref`s may resolve to a duration at the semantic layer.)
timePoint
    : DURATION
    | REFERENCE
    ;

// A bare length of time, e.g. `3s`.
duration
    : DURATION
    | REFERENCE
    ;

// A metadata sub-block. Conventionally holds platform/aspect/duration/
// music/tags. The grammar treats it like any other block.
metaBlock
    : META block
    ;

// Named constant, referenced later as $NAME.
defineDecl
    : DEFINE IDENT EQ value
    ;

// Pull in another .reel file (typically for shared define/meta). The
// grammar only records the path; resolving, loading and merging are the
// consumer's responsibility (see README "Imports & scope").
importDecl
    : IMPORT STRING
    ;

// The body of a reel, scene, or meta block: zero or more statements.
block
    : LBRACE statement* RBRACE
    ;

// A key/value pair. Multiple comma-separated values are allowed
// (e.g. `sfx: "whoosh", "pop"`).
property
    : IDENT COLON value (COMMA value)*
    ;

// A value optionally carries trailing style tags
// (e.g. `text: "POV" #big #center`).
value
    : primary tags?
    ;

tags
    : TAG+
    ;

// Attribution clause: `by "Artist"` or `by $ARTIST_REF`.
byClause
    : BY (STRING | REFERENCE)
    ;

// The value universe. Ordered so the most specific tokens are tried first.
primary
    : STRING byClause?           # stringPrimary     // "song" by "artist"
    | DURATION                   # durationPrimary   // 30s, 500ms, 2m
    | NUMBER                     # numberPrimary     // 30, 1.5
    | ASPECT                     # aspectPrimary     // 9:16
    | BOOL                       # boolPrimary       // true | false
    | REFERENCE                  # referencePrimary  // $MAX_LEN
    | keyword byClause?          # keywordPrimary    // cut, fade_out, instagram
    | list                       # listPrimary       // ["a", "b"]
    | IDENT byClause?            # identPrimary      // arbitrary identifier
    | TAG+                       # tagPrimary        // #fyp #viral
    ;

// Lets reserved words also be used as plain values (e.g. `format: short`).
keyword
    : REEL
    | SHORT
    | VIDEO
    | TIKTOK
    | SCENE
    | META
    | BY
    | DEFINE
    | IMPORT
    ;

list
    : LBRACK (value (COMMA value)*)? COMMA? RBRACK
    ;

/* ════════════════════════ Lexer rules ════════════════════════ */

// --- Reserved words (must precede IDENT) ---
REEL     : 'reel';
SHORT    : 'short';
VIDEO    : 'video';
TIKTOK   : 'tiktok';
SCENE    : 'scene';
META     : 'meta';
BY       : 'by';
DEFINE   : 'define';
IMPORT   : 'import';

// --- Composite tokens (must precede NUMBER / COLON / IDENT) ---
// An aspect ratio such as 9:16. Matched as one token so the inner ':'
// does not collide with the key/value COLON.
ASPECT    : DIGIT+ ':' DIGIT+ ;

// A length of time with a unit: 30s, 500ms, 2m, 1.5s, 1h.
DURATION  : DIGIT+ ('.' DIGIT+)? ('ms' | 's' | 'm' | 'h') ;

// A boolean literal.
BOOL      : 'true' | 'false' ;

// A hashtag-style style tag. Unlike IDENT, a tag MAY start with a digit
// (#2025goals, #100daychallenge), because that is how real hashtags work.
TAG       : '#' TAG_BODY ;

// A reference to a defined constant: $MAX_LEN.
REFERENCE : '$' IDENT_TEXT ;

// A plain number with optional fraction: 30, 1.5.
NUMBER    : DIGIT+ ('.' DIGIT+)? ;

// An identifier (also used for property keys and keyword-style values).
// Unicode-aware: café, über, привет are valid. Allows internal hyphens /
// underscores: fade_out, zoom-in, slow-mo.
IDENT     : IDENT_TEXT ;

// Single/double quoted strings with backslash escapes. The escaped char
// may be anything EXCEPT a newline, so a trailing backslash cannot swallow
// a real line break (which would push parse errors many lines downstream).
STRING    : '"'  (~["\\\r\n] | '\\' ~[\r\n])* '"'
          | '\'' (~['\\\r\n] | '\\' ~[\r\n])* '\''
          ;

// --- Punctuation ---
LBRACE   : '{';
RBRACE   : '}';
LBRACK   : '[';
RBRACK   : ']';
LPAREN   : '(';
RPAREN   : ')';
COLON    : ':';
COMMA    : ',';
MINUS    : '-';
RANGE    : '..';
EQ       : '=';

// --- Comments & whitespace (discarded) ---
BLOCK_COMMENT : '/*' .*? '*/' -> skip ;
LINE_COMMENT  : '//' ~[\r\n]*  -> skip ;
WS            : [ \t\r\n]+ -> skip ;

// --- Fragments ---
fragment DIGIT      : [0-9] ;

// Identifier body: a Unicode letter or '_' first, then letters/digits/'_'/'-'.
// (Identifiers must not start with a digit, so bare numbers stay NUMBER.)
fragment IDENT_TEXT : [\p{L}_] [\p{L}\p{N}_-]* ;

// Tag body: like an identifier but a leading DIGIT is also allowed
// (#2025goals). Kept separate so it does not weaken IDENT/NUMBER.
fragment TAG_BODY   : [\p{L}\p{N}_] [\p{L}\p{N}_-]* ;
