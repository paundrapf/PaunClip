import sys
path='web/app.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('clearInterval(polling);', 'if (homePolling) clearInterval(homePolling);')
c = c.replace('polling = null;', 'homePolling = null;')
c = c.replace("if (p.status && (p.status.startsWith('error') || p.status === 'complete')) {", "if (p.status && (p.status.toLowerCase().startsWith('error') || p.status.toLowerCase() === 'complete')) {\n      if (p.status.toLowerCase() === 'complete') {\n        setActiveView('sessions', 'sessions');\n        loadSessions(true);\n      }")

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
