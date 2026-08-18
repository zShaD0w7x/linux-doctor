#compdef linux-doctor

_linux_doctor_check_ids() {
  local -a ids
  ids=(${(f)"$(linux-doctor --list 2>/dev/null | grep -oP '^\s+\K[a-z][a-z0-9-]+(?=\s+—)' 2>/dev/null)"})
  _describe 'check id' ids
}

_linux_doctor() {
  _arguments \
    '--check=[run specific check(s), comma-separated]:check id:_linux_doctor_check_ids' \
    '--list[list available checks]' \
    '--json[print findings as JSON]' \
    '--plain[print plain tab-separated text]' \
    '--web[open visual dashboard in browser]' \
    '--ai[add AI summary (needs LLM_API_KEY)]' \
    '--push=[post report to fleet server]:url:' \
    '--ignore=[hide findings by title]:pattern:' \
    '--schema[print the JSON Schema]' \
    '--profile[show check durations]' \
    '--help[show help]' \
    '--version[show version]' \
    '*:: :->args'
}

if [[ "$funcstack[1]" == "_linux_doctor" ]]; then
  _linux_doctor "$@"
fi
