#!/usr/bin/env bash
# Klaert die vier unverifizierten OCS-Fakten aus docs/RESEARCH-OCS.md.
# Das App-Passwort wird interaktiv gelesen und nirgends gespeichert oder geloggt.
#
#   bash docs/nc-verify.sh <admin-user>
#   bash docs/nc-verify.sh <admin-user> --mit-laengentest   # legt testweise einen User an!
#
set -u

BASE="https://cloud.xapient.solutions"
HDR='OCS-APIRequest: true'
USER="${1:?Aufruf: bash docs/nc-verify.sh <admin-user> [--mit-laengentest]}"
LAENGENTEST="${2:-}"

read -rsp "App-Passwort fuer $USER: " PASS; echo; echo

req() { curl -sS -u "$USER:$PASS" -H "$HDR" "$@"; }

echo "=============================================================="
echo " 1) users/details  -- v1 vs v2: welcher Pfad antwortet mit OCS?"
echo "=============================================================="
for V in v1 v2; do
  printf '%s: ' "$V"
  req "$BASE/ocs/$V.php/cloud/users/details?limit=1&format=json" \
      -o /tmp/ncd-$V.json -w 'HTTP %{http_code}\n'
  head -c 500 /tmp/ncd-$V.json; echo; echo
done

echo "=============================================================="
echo " 2) Quota-Form beim EINZELUSER (Skalar oder Objekt?)"
echo "=============================================================="
req "$BASE/ocs/v1.php/cloud/users/$USER?format=json" \
  | python3 -c 'import sys,json
d=json.load(sys.stdin)["ocs"]["data"]
print("quota-Feld:", json.dumps(d.get("quota")))
print("Typ:", type(d.get("quota")).__name__)' 2>/dev/null || echo "  Parsing fehlgeschlagen"
echo

echo "=============================================================="
echo " 3) Quota-Form im DETAILS-Endpunkt (zum Vergleich)"
echo "=============================================================="
python3 -c 'import json
for v in ("v1","v2"):
    try:
        d=json.load(open("/tmp/ncd-%s.json"%v))["ocs"]["data"]
        users=d.get("users") or d
        first=list(users.values())[0] if isinstance(users,dict) else users[0]
        print(v, "->", json.dumps(first.get("quota")))
    except Exception as e:
        print(v, "-> nicht auswertbar:", e)' 2>/dev/null
echo

echo "=============================================================="
echo " 4) Gruppenmitglieder: {users:[...]} oder nacktes Array?"
echo "=============================================================="
req "$BASE/ocs/v1.php/cloud/groups/admin?format=json" -w '\nHTTP %{http_code}\n' | head -c 500
echo; echo

echo "=============================================================="
echo " 5) Gruppenliste (Shape-Abgleich)"
echo "=============================================================="
req "$BASE/ocs/v1.php/cloud/groups?format=json" | head -c 300
echo; echo

if [ "$LAENGENTEST" = "--mit-laengentest" ]; then
  echo "=============================================================="
  echo " 6) MAX_USERID_LENGTH -- erwartet einen FEHLER bei 65 Zeichen"
  echo "    ACHTUNG: schlaegt der Test fehl wie erwartet, ist nichts"
  echo "    passiert. Wird der User doch angelegt, bitte loeschen!"
  echo "=============================================================="
  LONG=$(printf 'a%.0s' $(seq 1 65))
  req -X POST "$BASE/ocs/v1.php/cloud/users?format=json" \
      -d "userid=$LONG" -d "password=Pruef-Lauf-9876!" | head -c 400
  echo
  echo "Falls statuscode 100 kam, diesen User wieder loeschen:"
  echo "  curl -u '$USER:<pw>' -H '$HDR' -X DELETE \\"
  echo "    '$BASE/ocs/v1.php/cloud/users/$LONG?format=json'"
else
  echo "( 6) Laengentest uebersprungen. Mit --mit-laengentest aktivieren;"
  echo "     er versucht einen User mit 65 Zeichen anzulegen. )"
fi

rm -f /tmp/ncd-v1.json /tmp/ncd-v2.json
echo
echo "Fertig. Bitte die komplette Ausgabe zurueckgeben."
