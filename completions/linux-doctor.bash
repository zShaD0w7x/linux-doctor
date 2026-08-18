_linux_doctor_checks() {
  local checks
  checks=$(linux-doctor --list 2>/dev/null | grep -oP '^\s+\K[a-z][a-z0-9-]+(?=\s+—)' 2>/dev/null)
  COMPREPLY=($(compgen -W "$checks" -- "${COMP_WORDS[COMP_CWORD]}"))
}

_linux_doctor() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    --check|--ignore|--push)
      if [ "$prev" = "--check" ]; then
        _linux_doctor_checks
      fi
      return
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "--check --list --json --plain --web --ai --push --ignore --schema --profile --help --version" -- "$cur"))
  elif [ "$prev" = "--check" ]; then
    _linux_doctor_checks
  fi
}

complete -F _linux_doctor linux-doctor
