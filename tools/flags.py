"""
Kleine Flaggen der Länderseiten als Inline-SVG (Schlüssel = »flag« in content/sites.json).

Verwendet im Länder-Knopf (Weltkugel + Flagge) in Header und Footer, im Länderdialog und
im 3D-Showroom (zoller-produktumgebung-3d/tools/build_locale.py).
"""

FLAGS = {
    "de": '<svg class="flag" viewBox="0 0 5 3" width="33" height="20" aria-hidden="true"><path fill="#000" d="M0 0h5v1H0z"/><path fill="#d00" d="M0 1h5v1H0z"/><path fill="#ffce00" d="M0 2h5v1H0z"/></svg>',
    "ca": ('<svg class="flag" viewBox="0 0 9600 4800" width="40" height="20" aria-hidden="true"><path fill="#d52b1e" d="M0 0h9600v4800H0z"/><path fill="#fff" d="M2400 0h4800v4800H2400z"/>'
           '<path fill="#d52b1e" d="m4890 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z"/></svg>'),
    "mx": ('<svg class="flag" viewBox="0 0 21 12" width="35" height="20" aria-hidden="true"><path fill="#006847" d="M0 0h7v12H0z"/><path fill="#fff" d="M7 0h7v12H7z"/><path fill="#ce1126" d="M14 0h7v12h-7z"/>'
           '<ellipse cx="10.5" cy="6" rx="1.7" ry="1.9" fill="#8c5a2b"/><path d="M8.9 7.2c.9 1 2.3 1 3.2 0" fill="none" stroke="#2e7d32" stroke-width=".45"/></svg>'),
    # 13 Streifen à 10 Einheiten; die 50 Sterne als runde Punkte (Strichmuster mit Länge 0), bei Flaggengröße nicht unterscheidbar
    "us": ('<svg class="flag" viewBox="0 0 247 130" width="38" height="20" aria-hidden="true"><path fill="#b22234" d="M0 0h247v130H0z"/>'
           '<path stroke="#fff" stroke-width="10" d="M0 15h247M0 35h247M0 55h247M0 75h247M0 95h247M0 115h247"/><path fill="#3c3b6e" d="M0 0h98.8v70H0z"/>'
           '<path fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-dasharray="0 16.4" '
           'd="M8.2 7h82.1M16.4 14h65.7M8.2 21h82.1M16.4 28h65.7M8.2 35h82.1M16.4 42h65.7M8.2 49h82.1M16.4 56h65.7M8.2 63h82.1"/></svg>'),
}
