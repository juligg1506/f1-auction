import sys,json,sqlite3
x=json.load(sys.stdin);db=sqlite3.connect(x['file']);db.row_factory=sqlite3.Row
db.execute('PRAGMA foreign_keys = ON')
try:
 db.execute('BEGIN IMMEDIATE')
 results=[]
 for item in x['statements']:
  before=db.total_changes
  cur=db.execute(item['sql'],item.get('args',[]))
  rows=[dict(r) for r in cur.fetchall()] if cur.description else []
  results.append({'results':rows,'meta':{'changes':db.total_changes-before}})
 db.commit();print(json.dumps(results))
except Exception as e:
 db.rollback();print(str(e),file=sys.stderr);sys.exit(1)
