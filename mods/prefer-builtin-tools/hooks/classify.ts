/**
 * Pure classifier: does a Bash command only do a job a built-in tool does better?
 *
 * Conservative by design. It understands a small subset of shell (one simple
 * command, quoted words, `>` into a file, a heredoc, and `| head -n N` after a
 * search) and answers `undefined` for anything else: `&&`, `;`, `$(...)`, a
 * variable, a pipeline with real work, an unknown flag, a glob where a file
 * should be, `~`, `/dev`, `/proc`, `/sys`. A command it is unsure of is never classified.
 */

/** The rules, each switchable in the plugin's options under the same key. */
export const RULES = ['read', 'grep', 'glob', 'edit', 'write'] as const
export type Rule = (typeof RULES)[number]

export type BuiltinTool = 'Read' | 'Grep' | 'Glob' | 'Edit' | 'Write'

export const TOOL_OF: Readonly<Record<Rule, BuiltinTool>> = {
  read: 'Read',
  grep: 'Grep',
  glob: 'Glob',
  edit: 'Edit',
  write: 'Write',
}

const HINT_OF: Readonly<Record<Rule, string>> = {
  read: 'it reads a file, with offset and limit for a range of lines',
  grep: 'it searches file contents, with glob/type filters, context lines and head_limit',
  glob: 'it finds files by name pattern, such as **/*.ts',
  edit: 'it replaces exact text in a file',
  write: 'it writes a whole file',
}

export type Suggestion = { rule: Rule; tool: BuiltinTool; program: string }

/** One shell word after quote removal. */
type Word = { text: string; isQuoted: boolean; hasGlob: boolean }
type Op = '|' | '>' | '>>' | '<<' | '<<-'
type Token = { kind: 'word'; word: Word } | { kind: 'op'; op: Op }

const GLOB_CHARS = new Set(['*', '?', '[', ']', '{', '}'])
const UNSUPPORTED_CHARS = new Set(['&', ';', '(', ')', '`', '$', '#', '\n', '\r'])

/** Splits one line into words and the few operators understood; undefined for anything else. */
const tokenize = (line: string): Token[] | undefined => {
  const tokens: Token[] = []
  let text = ''
  let isQuoted = false
  let hasGlob = false
  let isInWord = false

  const endWord = () => {
    if (isInWord) tokens.push({ kind: 'word', word: { text, isQuoted, hasGlob } })
    text = ''
    isQuoted = false
    hasGlob = false
    isInWord = false
  }

  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string
    if (c === ' ' || c === '\t') {
      endWord()
    } else if (c === "'") {
      const close = line.indexOf("'", i + 1)
      if (close === -1) return undefined
      text += line.slice(i + 1, close)
      isQuoted = true
      isInWord = true
      i = close
    } else if (c === '"') {
      let j = i + 1
      for (; j < line.length && line[j] !== '"'; j++) {
        const d = line[j] as string
        // A `$` just before the closing quote or a space is itself (`"^x$"`); any other expands.
        const isLiteralDollar = d === '$' && (line[j + 1] === '"' || line[j + 1] === ' ')
        if ((d === '$' && !isLiteralDollar) || d === '`' || d === '\\') return undefined
        text += d
      }
      if (j >= line.length) return undefined
      isQuoted = true
      isInWord = true
      i = j
    } else if (c === '\\') {
      const next = line[i + 1]
      if (next === undefined) return undefined
      text += next
      isQuoted = true
      isInWord = true
      i++
    } else if (c === '|') {
      if (line[i + 1] === '|' || line[i + 1] === '&') return undefined
      endWord()
      tokens.push({ kind: 'op', op: '|' })
    } else if (c === '>' || c === '<') {
      // `2>`, `x>y`, `>&`, `>|`, `<`, `<<<`, `<(` are all left alone.
      if (isInWord) return undefined
      const rest = line.slice(i)
      const op = (['>>', '>', '<<-', '<<'] as const).find(o => rest.startsWith(o))
      if (op === undefined) return undefined
      const after = rest[op.length]
      if (after === '&' || after === '|' || after === '<' || after === '>' || after === '(') return undefined
      tokens.push({ kind: 'op', op })
      i += op.length - 1
    } else if (UNSUPPORTED_CHARS.has(c)) {
      return undefined
    } else {
      if (GLOB_CHARS.has(c)) hasGlob = true
      text += c
      isInWord = true
    }
  }
  endWord()
  return tokens
}

/** One simple command: its words, where its stdout goes, and its heredoc. */
type Simple = {
  argv: Word[]
  stdout?: { isAppend: boolean; target: Word }
  heredoc?: { tag: Word; isTabStripped: boolean }
}

const toSimple = (tokens: readonly Token[]): Simple | undefined => {
  const argv: Word[] = []
  let stdout: Simple['stdout']
  let heredoc: Simple['heredoc']
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token
    if (token.kind === 'word') {
      argv.push(token.word)
      continue
    }
    const next = tokens[i + 1]
    if (token.op === '|' || next === undefined || next.kind !== 'word') return undefined
    i++
    if (token.op === '>' || token.op === '>>') {
      if (stdout !== undefined) return undefined
      stdout = { isAppend: token.op === '>>', target: next.word }
    } else {
      if (heredoc !== undefined) return undefined
      heredoc = { tag: next.word, isTabStripped: token.op === '<<-' }
    }
  }
  if (argv.length === 0) return undefined
  return { argv, ...(stdout && { stdout }), ...(heredoc && { heredoc }) }
}

/** A command split into its parts: at most two pipeline stages and a heredoc body. */
type Parsed = { stages: Simple[]; body?: string }

const parse = (command: string): Parsed | undefined => {
  const [first, ...rest] = command.trim().split('\n')
  if (first === undefined) return undefined
  const tokens = tokenize(first)
  if (tokens === undefined) return undefined

  const groups = tokens.reduce<Token[][]>(
    (acc, token) => (token.kind === 'op' && token.op === '|' ? [...acc, []] : [...acc.slice(0, -1), [...(acc.at(-1) ?? []), token]]),
    [[]],
  )
  const stages = groups.map(toSimple)
  if (!stages.every((s): s is Simple => s !== undefined)) return undefined
  if (stages.length > 2) return undefined

  const heredocs = stages.flatMap(s => (s.heredoc ? [s.heredoc] : []))
  if (heredocs.length === 0) return rest.length === 0 ? { stages } : undefined
  const heredoc = heredocs[0]
  if (heredocs.length > 1 || stages.length > 1 || heredoc === undefined) return undefined

  const end = rest.findIndex(line => (heredoc.isTabStripped ? line.replace(/^\t+/, '') : line) === heredoc.tag.text)
  if (end === -1 || rest.slice(end + 1).some(line => line.trim() !== '')) return undefined
  const lines = rest.slice(0, end).map(line => (heredoc.isTabStripped ? line.replace(/^\t+/, '') : line))
  return { stages, body: lines.join('\n') }
}

const startsWithDash = (word: Word) => word.text.startsWith('-') && word.text.length > 1

/** Paths the shell expands (`~`) or that are not ordinary files (`/dev`, `/proc`, `/sys`). */
const isSpecialPath = (text: string) => text.startsWith('~') || /^\/(dev|proc|sys)(\/|$)/.test(text)

/** A word that names one file the way the built-in tools take one. */
const isPlainPath = (word: Word) =>
  word.text !== '' && !word.hasGlob && !word.text.startsWith('-') && !isSpecialPath(word.text)

const isCount = (text: string) => /^\d+$/.test(text)

/** `head` as the last stage of a search: `head`, `head -N`, `head -n N`, `head -nN`. */
const isHeadLimit = (stage: Simple): boolean => {
  if (stage.stdout || stage.heredoc) return false
  const [name, ...args] = stage.argv.map(w => w.text)
  if (name !== 'head') return false
  if (args.length === 0) return true
  if (args.length === 1) return /^-n?\d+$/.test(args[0] as string)
  return args.length === 2 && args[0] === '-n' && isCount(args[1] as string)
}

type OptionSpec = {
  shortFlags: string
  shortWithValue: string
  longFlags: readonly string[]
  longWithValue: readonly string[]
}

type Options = { positionals: Word[]; values: ReadonlyMap<string, string> }

/** Reads flags against an allowlist; undefined on any flag it does not know. */
const readOptions = (args: readonly Word[], spec: OptionSpec): Options | undefined => {
  const positionals: Word[] = []
  const values = new Map<string, string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as Word
    const text = arg.text
    if (text === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    if (text.startsWith('--')) {
      const eq = text.indexOf('=')
      const name = eq === -1 ? text : text.slice(0, eq)
      if (spec.longWithValue.includes(name)) {
        if (eq !== -1) values.set(name, text.slice(eq + 1))
        else {
          const value = args[++i]
          if (value === undefined) return undefined
          values.set(name, value.text)
        }
      } else if (!(eq === -1 && spec.longFlags.includes(name))) return undefined
      continue
    }
    if (!startsWithDash(arg)) {
      positionals.push(arg)
      continue
    }
    for (let j = 1; j < text.length; j++) {
      const letter = text[j] as string
      if (spec.shortFlags.includes(letter)) continue
      if (!spec.shortWithValue.includes(letter)) return undefined
      const inline = text.slice(j + 1)
      if (inline !== '') values.set(`-${letter}`, inline)
      else {
        const value = args[++i]
        if (value === undefined) return undefined
        values.set(`-${letter}`, value.text)
      }
      break
    }
  }
  return { positionals, values }
}

const GREP_SPEC: OptionSpec = {
  shortFlags: 'rniclEHhI',
  shortWithValue: 'ABCe',
  longFlags: [
    '--recursive',
    '--line-number',
    '--ignore-case',
    '--files-with-matches',
    '--count',
    '--extended-regexp',
    '--with-filename',
    '--no-filename',
  ],
  longWithValue: [
    '--include',
    '--color',
    '--colour',
    '--context',
    '--after-context',
    '--before-context',
  ],
}

/** Only flags the Grep tool's input has (-i, -n, output_mode, -A/-B/-C, type, glob) or that change no result (case-sensitive is its default, headings are display). */
const RG_SPEC: OptionSpec = {
  shortFlags: 'inlcsNH',
  shortWithValue: 'ABCetg',
  longFlags: [
    '--ignore-case',
    '--line-number',
    '--files-with-matches',
    '--count',
    '--case-sensitive',
    '--no-heading',
    '--with-filename',
  ],
  longWithValue: ['--type', '--glob', '--context', '--after-context', '--before-context'],
}

/** `grep`/`egrep` with a pattern and at least one path (none reads stdin), or `rg`. */
const isSearch = (argv: readonly Word[]): boolean => {
  const [name, ...args] = argv
  const isRg = name?.text === 'rg'
  if (!isRg && name?.text !== 'grep' && name?.text !== 'egrep') return false
  const options = readOptions(args, isRg ? RG_SPEC : GREP_SPEC)
  if (options === undefined) return false
  const hasPatternFlag = options.values.has('-e')
  const pattern = hasPatternFlag ? undefined : options.positionals[0]
  if (!hasPatternFlag && (pattern === undefined || pattern.hasGlob)) return false
  const paths = hasPatternFlag ? options.positionals : options.positionals.slice(1)
  if (!paths.every(isPlainPath)) return false
  return isRg || paths.length > 0
}

/** `find [path] -name|-iname|-path PATTERN ... -type f`, nothing else: without `-type f` it finds directories too, which Glob does not. */
const isFindByName = (argv: readonly Word[]): boolean => {
  const [name, ...args] = argv
  if (name?.text !== 'find') return false
  const firstPredicate = args.findIndex(startsWithDash)
  const paths = firstPredicate === -1 ? args : args.slice(0, firstPredicate)
  if (paths.length > 1 || !paths.every(isPlainPath)) return false
  const predicates = firstPredicate === -1 ? [] : args.slice(firstPredicate)
  let hasNamePattern = false
  let isFilesOnly = false
  for (let i = 0; i < predicates.length; i += 2) {
    const key = (predicates[i] as Word).text
    const value = predicates[i + 1]
    if (value === undefined || value.hasGlob) return false
    if (key === '-name' || key === '-iname' || key === '-path') hasNamePattern = true
    else if (key === '-type' && value.text === 'f') isFilesOnly = true
    else return false
  }
  return hasNamePattern && isFilesOnly
}

/** `head [-N | -n N | -nN] FILE`: the first lines, which Read's limit gives. */
const isHeadOfFile = (argv: readonly Word[]): boolean => {
  const [name, ...args] = argv
  if (name?.text !== 'head') return false
  const [first, second] = args.map(w => w.text)
  const file = args.at(-1)
  const isCountOk =
    args.length === 1 ||
    (args.length === 2 && /^-n?\d+$/.test(first ?? '')) ||
    (args.length === 3 && first === '-n' && isCount(second ?? ''))
  return isCountOk && file !== undefined && isPlainPath(file)
}

/**
 * `tail -n +N FILE` / `tail -n+N FILE`: from line N on, which Read's offset gives.
 * Every other tail counts from the end of the file, which Read cannot.
 */
const isTailFromLine = (argv: readonly Word[]): boolean => {
  const [name, ...args] = argv
  if (name?.text !== 'tail') return false
  const [first, second] = args.map(w => w.text)
  const file = args.at(-1)
  const isFromLine =
    (args.length === 2 && /^-n\+\d+$/.test(first ?? '')) ||
    (args.length === 3 && first === '-n' && /^\+\d+$/.test(second ?? ''))
  return isFromLine && file !== undefined && isPlainPath(file)
}

/** `cat FILE`, `head` of a file, `tail` from a line on, `sed -n 'N[,M]p' FILE`. */
const isFileRead = (argv: readonly Word[]): boolean => {
  const [name, ...args] = argv
  if (name?.text === 'cat') return args.length === 1 && isPlainPath(args[0] as Word)
  if (name?.text === 'sed') {
    const [flag, script, file] = args
    return (
      args.length === 3 &&
      flag?.text === '-n' &&
      /^\d+(,\d+)?p$/.test(script?.text ?? '') &&
      file !== undefined &&
      isPlainPath(file)
    )
  }
  return isHeadOfFile(argv) || isTailFromLine(argv)
}

/** Text a sed regex reads as itself (a `.` is taken as meant literally). */
const isLiteralRegex = (text: string) => text !== '' && !/[*[\]^$\\+?(){}|]/.test(text)

/** One `s/old/new/[g]` with literal text, which Edit (with replace_all) does exactly. */
const isLiteralSubstitution = (script: string): boolean => {
  const delimiter = script[1]
  if (script[0] !== 's' || delimiter === undefined || !'/#|,:'.includes(delimiter)) return false
  const parts = script.slice(2).split(delimiter)
  if (parts.length !== 3) return false
  const [old, replacement, flags] = parts as [string, string, string]
  return isLiteralRegex(old) && !/[&\\]/.test(replacement) && (flags === '' || flags === 'g')
}

/** `sed -i[SUFFIX] [-E] 's/old/new/[g]' FILE`, also macOS's `sed -i '' ...`. */
const isInPlaceEdit = (argv: readonly Word[]): boolean => {
  const [name, ...args] = argv
  if (name?.text !== 'sed') return false
  let isInPlace = false
  const scripts: string[] = []
  const files: Word[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as Word
    if (arg.text === '-i') {
      isInPlace = true
      if (args[i + 1]?.text === '' && args[i + 1]?.isQuoted) i++
    } else if (arg.text.startsWith('-i') && !arg.hasGlob) isInPlace = true
    else if (arg.text === '-E' || arg.text === '-r') continue
    else if (arg.text === '-e') {
      const script = args[++i]
      if (script === undefined) return false
      scripts.push(script.text)
    } else if (startsWithDash(arg)) return false
    else if (scripts.length === 0) scripts.push(arg.text)
    else files.push(arg)
  }
  const [script] = scripts
  const [file] = files
  return (
    isInPlace &&
    scripts.length === 1 &&
    script !== undefined &&
    isLiteralSubstitution(script) &&
    files.length === 1 &&
    file !== undefined &&
    isPlainPath(file)
  )
}

/** An echo argument the shell would not expand: no unquoted glob or brace, no leading `~`. */
const isLiteralEchoArg = (word: Word) => !word.hasGlob && !word.text.startsWith('~')

/** `echo literal words > FILE` or `cat > FILE <<'EOF' ... EOF` with literal text. */
const isFileWrite = (stage: Simple, body: string | undefined): boolean => {
  const { argv, stdout, heredoc } = stage
  if (stdout === undefined || stdout.isAppend || !isPlainPath(stdout.target)) return false
  const [name, ...args] = argv
  if (name?.text === 'echo') {
    return heredoc === undefined && args.length > 0 && args.every(arg => !startsWithDash(arg) && isLiteralEchoArg(arg))
  }
  if (name?.text !== 'cat' || args.length > 0 || heredoc === undefined || body === undefined) return false
  return heredoc.tag.isQuoted || !/[$`\\]/.test(body)
}

/** Which rule a command falls under, or undefined when it should run as Bash. */
export const classify = (command: string): Suggestion | undefined => {
  const parsed = parse(command)
  if (parsed === undefined) return undefined
  const [stage, pipedTo] = parsed.stages
  if (stage === undefined) return undefined
  const program = (stage.argv[0] as Word).text
  const isPlain = stage.stdout === undefined && stage.heredoc === undefined
  const suggest = (rule: Rule): Suggestion => ({ rule, tool: TOOL_OF[rule], program })

  if (pipedTo !== undefined) {
    if (!isPlain || !isHeadLimit(pipedTo)) return undefined
    if (isSearch(stage.argv)) return suggest('grep')
    if (isFindByName(stage.argv)) return suggest('glob')
    return undefined
  }
  if (isFileWrite(stage, parsed.body)) return suggest('write')
  if (!isPlain) return undefined
  if (isFileRead(stage.argv)) return suggest('read')
  if (isSearch(stage.argv)) return suggest('grep')
  if (isFindByName(stage.argv)) return suggest('glob')
  if (isInPlaceEdit(stage.argv)) return suggest('edit')
  return undefined
}

/** The text the model reads in place of the Bash result. */
export const denyMessage = (suggestion: Suggestion): string =>
  `Use the ${suggestion.tool} tool instead of \`${suggestion.program}\` in Bash: ${HINT_OF[suggestion.rule]}. ` +
  `(prefer-builtin-tools; the "${suggestion.rule}" rule can be turned off in /config.)`
