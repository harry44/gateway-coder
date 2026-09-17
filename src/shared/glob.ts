// Minimal glob -> RegExp for matching POSIX-style relative paths (forward slashes).
// Supports: **  (any path segments), *  (any chars except /), ?  (single char).

export function globToRegExp(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches across directory separators
        re += '.*'
        i++
        if (pattern[i + 1] === '/') i++ // consume trailing slash after **
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp('^' + re + '$')
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path.replace(/\\/g, '/'))
}
