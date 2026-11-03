ULTRA GYM – kaksijakoinen hypertrofiaohjelma + treenisovellus

Sovellus sisältää:
- Ylävartalo A / alavartalo B, oletuksena 3 salitreeniä viikossa
- Toistot, sarjat, RIR, työpainot ja automaattiset painosuositukset
- Palautustaukojen ajastin, historiatiedot, kaaviot ja kehonpainoseuranta
- Ohjelman liikkeiden ja sarjamäärien muokkaus
- JSON-varmuuskopiointi ja CSV-vienti
- Offline-käyttö, kun sovellus on ladattu ensimmäisen kerran

ASENNUS IPHONELLE TAI IPADILLE – SUOSITELTU TAPA

1. Kirjaudu GitHubiin selaimella ja luo uusi julkinen repo esimerkiksi nimellä ultra-gym.
2. Lataa kaikki viisi tiedostoa repon juureen (index.html, manifest.webmanifest,
   sw.js, icon-192.png, icon-512.png). Älä lataa vain zipiä sellaisenaan.
3. Repossa: Settings → Pages → Build and deployment → Deploy from a branch.
   Branch: main, folder: / (root). Tallenna.
4. Avaa GitHub Pagesin julkaisema osoite SAFARISSA (ei ChatGPT:n sisäisessä selaimessa).
   Tyypillinen osoite: https://KÄYTTÄJÄTUNNUS.github.io/ultra-gym/
5. Safari → Jaa → Lisää Koti-valikkoon → Lisää.
6. Käynnistä Ultra Gym kotivalikon kuvakkeesta. Tiedot tallentuvat kyseisen
   asennetun sovelluksen paikalliseen muistiin.

TIETOSUOJA JA VARMUUSKOPIOINTI
- Treenitietoja ei lähetetä ulkopuoliseen palveluun. Selaintallennus vain paikallisesti.
- Treenihistoria EI synkronoidu automaattisesti iPhonen, iPadin ja tietokoneen välillä.
- Vie Asetukset → Vie kaikki (JSON) säännöllisesti iCloud Driveen.
- Varmuuskopio voidaan palauttaa Asetukset → Tuo varmuuskopio.
- Jos tyhjennät sovelluksen/selaimen tiedot, historiat voivat poistua.

PAINOMERKINNÄT
- Käsipainoliikkeissä kirjaa yhden käsipainon paino.
- Laitteissa kirjaa kyseisen laitteen näyttämä paino johdonmukaisesti.
- Arvioitu 1RM on viitteellinen, ei testattu maksimipaino.

VERKKOTURVALLISUUS
- GitHub Pages -repon koodi voi olla julkinen, mutta treenitietosi eivät tallennu repoon.
- Halutessasi voit käyttää muuta HTTPS-staattista hostingia.
