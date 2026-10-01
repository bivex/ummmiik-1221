/*
 * Song — a domain-specific language (DSL) for songwriting, music composition,
 * arrangement, chords, lyrics, and song structure.
 *
 * A Song program describes the musical structure of a track:
 * its metadata (BPM, key, time signature, genre, artist), an ordered list of
 * sections (intro, verse, pre-chorus, chorus, bridge, solo, drop, outro)
 * with bar-based or time-based timing, and per-section musical properties
 * (lyrics, chords, vocals, instruments, dynamics, style tags).
 *
 * Minimal example:
 *
 *     song "My Song" {
 *       meta {
 *         bpm: 120
 *         key: "Am"
 *         time_signature: 4/4
 *       }
 *       intro (4 bars) {
 *         chords: [Am, F]
 *       }
 *       verse "1" (8 bars) {
 *         chords: [Am, F, C, G]
 *         lyrics: "Walking down the empty street..."
 *       }
 *       chorus (8 bars) {
 *         chords: [F, G, Am, C]
 *         lyrics: "And the lights are shining bright!" #loud
 *       }
 *     }
 */
grammar Song;

/* ════════════════════════ Parser rules ════════════════════════ */

program
    : statement* EOF
    ;

statement
    : songDecl
    | sectionDecl
    | metaBlock
    | defineDecl
    | importDecl
    | property
    ;

// Video/Song declaration.
songDecl
    : songKind STRING? block
    ;

songKind
    : SONG
    | TRACK
    | BEAT
    | PIECE
    | REEL
    ;

// Section declaration: verse, chorus, bridge, intro, outro, etc.
sectionDecl
    : sectionKind STRING? sectionTiming? block
    ;

sectionKind
    : VERSE
    | CHORUS
    | BRIDGE
    | INTRO
    | OUTRO
    | PRE_CHORUS
    | HOOK
    | DROP
    | SOLO
    | SECTION
    | SCENE
    ;

// Timing can be: (8 bars), (4 bar), (16 beats), (0s - 30s), (1 .. 8 bars), (30s)
sectionTiming
    : LPAREN (timeRange | duration) RPAREN
    ;

timeRange
    : timePoint rangeSep timePoint
    ;

rangeSep
    : MINUS
    | RANGE
    ;

timePoint
    : DURATION
    | REFERENCE
    | NUMBER
    ;

duration
    : DURATION
    | REFERENCE
    | NUMBER
    ;

metaBlock
    : META block
    ;

defineDecl
    : DEFINE propertyKey EQ value
    ;

importDecl
    : IMPORT STRING
    ;

block
    : LBRACE statement* RBRACE
    ;

propertyKey
    : IDENT
    | CHORD
    | keyword
    ;

property
    : propertyKey COLON value (COMMA value)*
    ;

value
    : primary tags?
    ;

tags
    : TAG+
    ;

byClause
    : BY (STRING | REFERENCE)
    ;

primary
    : MULTILINE_STRING           # multilinePrimary
    | STRING byClause?           # stringPrimary
    | TIME_SIGNATURE             # timeSignaturePrimary
    | DURATION                   # durationPrimary
    | NUMBER                     # numberPrimary
    | CHORD                      # chordPrimary
    | BOOL                       # boolPrimary
    | REFERENCE                  # referencePrimary
    | keyword byClause?          # keywordPrimary
    | list                       # listPrimary
    | IDENT byClause?            # identPrimary
    | TAG+                       # tagPrimary
    ;

keyword
    : SONG | TRACK | BEAT | PIECE | REEL
    | VERSE | CHORUS | BRIDGE | INTRO | OUTRO | PRE_CHORUS | HOOK | DROP | SOLO | SECTION | SCENE
    | META | BY | DEFINE | IMPORT
    ;

list
    : LBRACK (value (COMMA value)*)? COMMA? RBRACK
    ;

/* ════════════════════════ Lexer rules ════════════════════════ */

// --- Reserved words ---
SONG       : 'song';
TRACK      : 'track';
BEAT       : 'beat';
PIECE      : 'piece';
REEL       : 'reel';
VERSE      : 'verse';
CHORUS     : 'chorus';
BRIDGE     : 'bridge';
INTRO      : 'intro';
OUTRO      : 'outro';
PRE_CHORUS : 'pre_chorus' | 'pre-chorus' | 'prechorus';
HOOK       : 'hook';
DROP       : 'drop';
SOLO       : 'solo';
SECTION    : 'section';
SCENE      : 'scene';
META       : 'meta';
BY         : 'by';
DEFINE     : 'define';
IMPORT     : 'import';

// --- Composite tokens ---
// Time signatures: 4/4, 3/4, 6/8, 7/8, 12/8
TIME_SIGNATURE : DIGIT+ '/' DIGIT+ ;

// Aspect ratios (optional, for video/visual compatibility): 9:16, 16:9
ASPECT         : DIGIT+ ':' DIGIT+ ;

// Durations and musical lengths:
// 8 bars, 4 bar, 16 beats, 1 beat, 8 measures, 30s, 500ms, 2m, 1h
DURATION
    : DIGIT+ ('.' DIGIT+)? [ \t]* ('bars' | 'bar' | 'beats' | 'beat' | 'measures' | 'measure' | 'ms' | 's' | 'm' | 'h')
    ;

BOOL : 'true' | 'false' ;

// Musical Chords:
// Matches chords like: Am, C#m, F#, Bb, Dmaj7, G7, Bdim, Asus4, Cadd9, F#m7, C/E, G/B
CHORD
    : [A-G] [b#]? ('maj'|'min'|'dim'|'aug'|'sus'|'add'|'m'|'M')? [0-9]* ('/' [A-G] [b#]?)?
    ;

// Style tags and hashtags: #energetic, #acoustic, #reverb
TAG : '#' TAG_BODY ;

// Constant references: $CHORDS, $TEMPO
REFERENCE : '$' IDENT_TEXT ;

// Plain numbers: 120, 3.5
NUMBER : DIGIT+ ('.' DIGIT+)? ;

// Identifiers: drums, vocal, synth, fade_out, slow-mo, etc.
IDENT : IDENT_TEXT ;

// Triple-quoted multi-line strings for song lyrics:
MULTILINE_STRING
    : '"""' .*? '"""'
    | '\'\'\'' .*? '\'\'\''
    ;

// Single-line strings
STRING
    : '"'  (~["\\\r\n] | '\\' ~[\r\n])* '"'
    | '\'' (~['\\\r\n] | '\\' ~[\r\n])* '\''
    ;

// Punctuation
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

// Comments & whitespace
BLOCK_COMMENT : '/*' .*? '*/' -> skip ;
LINE_COMMENT  : '//' ~[\r\n]*  -> skip ;
WS            : [ \t\r\n\u000C]+ -> skip ;

// Fragments
fragment DIGIT      : [0-9] ;
fragment IDENT_TEXT : [\p{L}_] [\p{L}\p{N}_-]* ;
fragment TAG_BODY   : [\p{L}\p{N}_] [\p{L}\p{N}_-]* ;
