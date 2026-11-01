import { expect, test } from 'claude-code/testing'
import { classify, type Rule } from '../hooks/classify'

const CLASSIFIED: ReadonlyArray<readonly [string, Rule]> = [
  ['cat src/index.ts', 'read'],
  ["cat '/tmp/a file.txt'", 'read'],
  ['head -n 40 README.md', 'read'],
  ['head -40 README.md', 'read'],
  ['tail -n +100 log.txt', 'read'],
  ['tail -n+100 log.txt', 'read'],
  ["sed -n '147,162p' /path/to/some/file", 'read'],
  ['sed -n 12p file.c', 'read'],
  ['grep -rn "^some pattern$" /path/to/dir', 'grep'],
  ["grep -A 3 -i 'TODO' src", 'grep'],
  ["grep --include='*.ts' -rl useState src", 'grep'],
  ['grep -e foo -e bar file.txt', 'grep'],
  ["rg 'fn main'", 'grep'],
  ['rg -t rust -n unwrap src', 'grep'],
  ["rg -i -l -g '*.ts' --no-heading useState src", 'grep'],
  ["rg --glob '*.md' TODO | head -n 20", 'grep'],
  ["grep -rn TODO src | head -20", 'grep'],
  ["find . -name '*.ts' -type f", 'glob'],
  ["find src -type f -iname '*.md'", 'glob'],
  ["find . -type f -name '*.log' | head", 'glob'],
  ["sed -i 's/oldName/newName/g' src/app.ts", 'edit'],
  ["sed -i '' 's/foo.bar/baz/' config.yml", 'edit'],
  ["sed -i.bak -e 's#a/b#c/d#' x.txt", 'edit'],
  ["echo 'hello world' > notes.txt", 'write'],
  ["cat > file.txt <<'EOF'\nline one $HOME\nline two\nEOF", 'write'],
  ['cat <<EOF > file.py\nprint("hi")\nEOF\n', 'write'],
  ['cat > out.md <<-END\n\t# Title\n\tEND', 'write'],
]

const LEFT_ALONE: readonly string[] = [
  // Pipelines with other work, chains, subshells, variables.
  'cat file.txt | wc -l',
  'grep foo file | sort',
  'cat a.txt && cat b.txt',
  'cd src; grep -r foo .',
  "cat > file.py <<EOF\nprint(1)\nEOF\nchmod +x file.py",
  "cat > file.py <<'EOF'\nprint(1)\nEOF && chmod +x file.py",
  'cat "$FILE"',
  'cat $(ls | head -1)',
  'grep foo `ls`',
  'FOO=1 grep foo file',
  'head -n 5 file1 file2',
  // stdin, devices, globs, several files.
  'cat',
  'cat -',
  'cat /dev/null',
  'cat /proc/cpuinfo',
  'cat /sys/class/net/eth0/address',
  "find /proc -name status -type f",
  // `~` is the shell's to expand.
  'cat ~/.zshrc',
  'head -n 5 ~/notes.txt',
  'find ~ -name x -type f',
  'grep -rn foo ~/src',
  "sed -i 's/a/b/' ~/x.txt",
  "echo hi > ~/x.txt",
  'cat *.txt',
  'cat a.txt b.txt',
  'grep foo',
  'grep -r foo',
  'grep foo src/*.ts',
  'head -n 5 < file.txt',
  // Flags the built-in tool has no match for.
  'cat -A file.txt',
  'grep -v foo file.txt',
  'grep -o foo file.txt',
  'grep -m 1 foo file.txt',
  'tail -f server.log',
  // tail counting from the end, which Read cannot.
  'tail log.txt',
  'tail -20 log.txt',
  'tail -n 20 log.txt',
  'tail -n20 log.txt',
  // rg flags the Grep tool has no input for.
  'rg -T js foo src',
  'rg --type-not js foo src',
  'rg -S foo src',
  'rg --smart-case foo src',
  'rg -U foo src',
  'rg --multiline foo src',
  'rg -w foo src',
  'tail -c 100 file.bin',
  'rg --files',
  'find . -name "*.ts" -exec rm {} +',
  'find . -type d -name node_modules',
  'find . -name node_modules',
  "find . -name '*.ts'",
  "grep -rnF 'a.b(' .",
  'grep -rw id src',
  'grep -R foo src',
  'grep -rs foo src',
  "grep -r --exclude-dir=dist foo src",
  "rg -F 'a.b(' src",
  'find . -mtime -1',
  'find .',
  // Edits a literal Edit cannot repeat.
  "sed -i 's/^foo/bar/' file.txt",
  "sed -i 's/a/b/' *.txt",
  "sed -i 's/a/b/' one.txt two.txt",
  "sed -i '/pattern/d' file.txt",
  "sed -i 's/(x)/\\1y/' file.txt",
  "sed 's/a/b/' file.txt",
  "sed -n '/start/,/end/p' file.txt",
  // Writes that are not a plain whole-file write.
  "echo 'more' >> notes.txt",
  'echo "$HOME" > out.txt',
  'echo -e "a\\tb" > out.txt',
  'echo *.ts > files.txt',
  'echo ~ > home.txt',
  'echo {a,b} > out.txt',
  'echo hi 2> err.txt',
  'echo hi > /dev/stderr',
  "cat > out.txt",
  'cat > out.txt <<EOF\nhome is $HOME\nEOF',
  'cat > out.txt <<EOF\nno terminator',
  // Other programs and redirections.
  'ls -la',
  'npm test',
  'git grep foo',
  '/usr/bin/grep foo file.txt',
  'grep foo file.txt > matches.txt',
  'cat file.txt 2>/dev/null',
]

test('commands a built-in tool does better are classified under their rule', () => {
  for (const [command, rule] of CLASSIFIED) {
    expect({ command, rule: classify(command)?.rule }).toEqual({ command, rule })
  }
})

test('anything ambiguous or doing other work is left to Bash', () => {
  for (const command of LEFT_ALONE) {
    expect({ command, rule: classify(command)?.rule }).toEqual({ command, rule: undefined })
  }
})
