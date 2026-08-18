complete -c linux-doctor -f

# Flags
complete -c linux-doctor -l check -r -d 'Run specific check(s), comma-separated'
complete -c linux-doctor -l list -d 'List available checks'
complete -c linux-doctor -l json -d 'Print findings as JSON'
complete -c linux-doctor -l plain -d 'Print plain tab-separated text'
complete -c linux-doctor -l web -d 'Open visual dashboard in browser'
complete -c linux-doctor -l ai -d 'Add AI summary (needs LLM_API_KEY)'
complete -c linux-doctor -l push -r -d 'Post report to fleet server'
complete -c linux-doctor -l ignore -r -d 'Hide findings by title'
complete -c linux-doctor -l schema -d 'Print the JSON Schema'
complete -c linux-doctor -l profile -d 'Show check durations'
complete -c linux-doctor -l help -s h -d 'Show help'
complete -c linux-doctor -l version -d 'Show version'

# Dynamic check IDs for --check
complete -c linux-doctor -l check -xa '(linux-doctor --list 2>/dev/null | string match -r "^\s+([a-z][a-z0-9-]+)" | string trim)'
