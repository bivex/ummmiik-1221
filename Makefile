# Song — build & test harness for the ANTLR4 grammar.
#
#   make              generate the parser + lexer and compile (incl. SongToJson)
#   make test         parse every examples/*.song, fail on any error
#   make test-errors  parse every examples/broken/*.song, fail if none errors
#   make json F=foo   emit a JSON timeline/arrangement for examples/foo.song
#   make viz          start the web visualizer (http://localhost:8000)
#   make tree F=foo   parse examples/foo.song and print the parse tree
#   make tokens F=foo dump the token stream for examples/foo.song
#   make gui F=foo    open the graphical parse-tree viewer
#   make clean        remove all generated artifacts

ANTLR_JAR := $(wildcard /opt/homebrew/Cellar/antlr/*/antlr-*-complete.jar)
CP       := $(ANTLR_JAR)
GEN      := SongParser.java SongLexer.java SongBaseListener.java SongListener.java
GEN_AUX  := Song.tokens Song.interp SongLexer.tokens SongLexer.interp
EXAMPLES := $(shell find examples -name '*.song' -not -path '*/broken/*')
BROKEN   := $(shell find examples/broken -name '*.song')
ERR_RE   := error|mismatch|expecting|no viable|token recognition|line [0-9]

.PHONY: all test test-errors tree tokens gui json viz clean

all: SongToJson.class

# Generate .java from the grammar, then compile grammar + the JSON listener.
SongToJson.class: Song.g4 SongToJson.java
	antlr4 Song.g4
	javac -cp "$(CP):." Song*.java SongToJson.java

# Positive: every example must parse with ZERO errors.
test: all
	@for f in $(EXAMPLES); do \
	  printf '── %s ... ' "$$f"; \
	  if java -cp "$(CP):." org.antlr.v4.gui.TestRig Song program -tree "$$f" 2>&1 \
	       | grep -iE '$(ERR_RE)' >/dev/null; then \
	    echo "❌ unexpected parse errors"; exit 1; \
	  else echo "✅ ok"; fi; \
	done

# Negative: every broken fixture MUST produce an error.
test-errors: all
	@for f in $(BROKEN); do \
	  printf '── %s ... ' "$$f"; \
	  if java -cp "$(CP):." org.antlr.v4.gui.TestRig Song program -tree "$$f" 2>&1 \
	       | grep -iE '$(ERR_RE)' >/dev/null; then echo "✅ rejected as expected"; \
	  else echo "❌ parsed without error (should have failed)"; exit 1; fi; \
	done

# JSON timeline via the reference listener:  make json F=cookbook
json: all
	java -cp "$(CP):." SongToJson examples/$(F).song

# Web visualizer (Python stdlib server):  make viz  →  http://localhost:8000
viz:
	python3 viz/server.py

# Parse-tree dump for one file:  make tree F=cookbook
tree: all
	java -cp "$(CP):." org.antlr.v4.gui.TestRig Song program -tree examples/$(F).song

# Token stream for one file:  make tokens F=hello
tokens: all
	java -cp "$(CP):." org.antlr.v4.gui.TestRig Song program -tokens examples/$(F).song

# GUI tree viewer:  make gui F=cookbook
gui: all
	java -cp "$(CP):." org.antlr.v4.gui.TestRig Song program -gui examples/$(F).song

clean:
	rm -f *.class $(GEN) $(GEN_AUX)
