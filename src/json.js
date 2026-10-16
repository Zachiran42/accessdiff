const MAX_BYTES = 256 * 1024;
const MAX_DEPTH = 16;

function fail(message, path = '$', code = 'INVALID_JSON') {
  const error = new Error(`${path} : ${message}`);
  error.path = path;
  error.code = code;
  throw error;
}

/** Read JSON without accepting overwritten keys or excessive input complexity. */
export function parseStrictJson(text, options = {}) {
  try {
    if (typeof text !== 'string') fail('le contenu doit être du texte JSON.');
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) {
      fail('le fichier dépasse la limite de 256 Kio en UTF-8.', '$', 'INPUT_SIZE_LIMIT');
    }

    let value;
    try {
      value = JSON.parse(text);
    } catch {
      fail('syntaxe JSON invalide. Vérifie les guillemets, virgules et accolades.');
    }

    // JSON.parse established syntax. This structural walk checks decoded keys and
    // container depth, which that parser deliberately does not constrain.
    let cursor = 0;
    function whitespace() {
      while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor += 1;
    }
    function stringToken() {
      const start = cursor++;
      while (cursor < text.length) {
        const character = text[cursor++];
        if (character === '\\') cursor += 1;
        else if (character === '"') break;
      }
      return text.slice(start, cursor);
    }
    function visit(depth, path) {
      whitespace();
      const character = text[cursor];
      if (character === '{' || character === '[') {
        if (depth + 1 > MAX_DEPTH) {
          fail('le JSON dépasse la profondeur maximale de 16.', path, 'INPUT_DEPTH_LIMIT');
        }
        cursor += 1;
        whitespace();
        if (character === '{') {
          const keys = new Set();
          while (text[cursor] !== '}') {
            const key = JSON.parse(stringToken());
            const keyPath = `${path}[${JSON.stringify(key)}]`;
            if (keys.has(key)) {
              fail(`clé JSON dupliquée ${JSON.stringify(key)}.`, keyPath, 'DUPLICATE_JSON_KEY');
            }
            keys.add(key);
            whitespace();
            cursor += 1; // colon
            visit(depth + 1, keyPath);
            whitespace();
            if (text[cursor] === ',') {
              cursor += 1;
              whitespace();
            } else break;
          }
        } else {
          let index = 0;
          while (text[cursor] !== ']') {
            visit(depth + 1, `${path}[${index++}]`);
            whitespace();
            if (text[cursor] === ',') {
              cursor += 1;
              whitespace();
            } else break;
          }
        }
        cursor += 1; // closing bracket/brace
      } else if (character === '"') {
        stringToken();
      } else {
        while (cursor < text.length && !/[\s,}\]]/.test(text[cursor])) cursor += 1;
      }
    }
    visit(0, '$');
    return value;
  } catch (error) {
    if (options.label) error.message = `${options.label} — ${error.message}`;
    throw error;
  }
}
