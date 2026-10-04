"""Génère les icônes de lancement de Porte-feuille.

Icône adaptive : pastille sombre, cercle doré, flèche ascendante.
Produit les PNG de secours (mipmap-*) et les drawables vectoriels XML
(ic_launcher_foreground / ic_launcher_background) utilisés par
mipmap-anydpi-v26/ic_launcher.xml.
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(ROOT, "..", "app", "src", "main", "res")

BG = (11, 15, 23, 255)
BG_2 = (24, 34, 51, 255)
GOLD = (245, 196, 81, 255)
GOLD_SOFT = (245, 196, 81, 90)

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def lissage(img: Image.Image, radius: float) -> Image.Image:
    """Passe une image RGBA en noir sur le canal alpha pour adoucir les bords."""
    alpha = img.split()[-1]
    for _ in range(3):
        alpha = alpha.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(radius))
    img.putalpha(alpha)
    return img


def fabriquer(taille: int, arrondi: float = 0.22) -> Image.Image:
    n = taille * 4
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Fond dégradé diagonal, coins arrondis.
    fond = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fond)
    fd.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * arrondi), fill=BG)
    degrade = Image.new("RGBA", (n, n))
    gd = ImageDraw.Draw(degrade)
    for i in range(n):
        couleur = lerp(BG, BG_2, i / max(1, n - 1))
        gd.line([(0, i), (n, i)], fill=couleur)
    masque = fond.split()[-1]
    img.paste(degrade, (0, 0), masque)

    # Cercle doré.
    m = n * 0.20
    d.ellipse([m, m, n - m, n - m], outline=GOLD, width=max(2, int(n * 0.045)))

    # Flèche ascendante stylisée (croissance).
    def pt(x, y):
        return (n * x, n * y)

    d.line([pt(0.30, 0.68), pt(0.44, 0.50), pt(0.56, 0.58), pt(0.72, 0.34)],
           fill=GOLD, width=max(3, int(n * 0.062)), joint="curve")
    # Pointe de flèche.
    d.polygon([pt(0.72, 0.34), pt(0.60, 0.345), pt(0.70, 0.455)], fill=GOLD)

    # Halo doux sous la flèche.
    d.line([pt(0.30, 0.68), pt(0.72, 0.34)], fill=GOLD_SOFT,
           width=max(6, int(n * 0.11)))

    img = lissage(img, 1.0)
    return img.resize((taille, taille), Image.LANCZOS)


def ecrire_foreground_svg() -> None:
    contenu = """<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:pathData="M30,71 L46,52 L58,60 L78,35"
        android:strokeColor="#F5C451"
        android:strokeWidth="7"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:fillColor="#00000000" />
    <path
        android:pathData="M78,35 L64,36 L75,49"
        android:fillColor="#F5C451" />
</vector>
"""
    chemin = os.path.join(RES, "drawable", "ic_launcher_foreground.xml")
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(contenu)


def main() -> None:
    for dossier, taille in DENSITIES.items():
        chemin = os.path.join(RES, dossier)
        os.makedirs(chemin, exist_ok=True)
        icone = fabriquer(taille)
        icone.save(os.path.join(chemin, "ic_launcher.png"))
        ronde = fabriquer(taille, arrondi=0.5)
        ronde.save(os.path.join(chemin, "ic_launcher_round.png"))
        print("icône", dossier, taille)

    ecrire_foreground_svg()

    # Couleur de fond adaptive + déclaration des icônes.
    with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                '    <color name="ic_launcher_background">#0F1524</color>\n</resources>\n')

    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    modele = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"""
    for nom in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi, nom), "w", encoding="utf-8") as f:
            f.write(modele)
    print("✓ icônes générées")


if __name__ == "__main__":
    main()
