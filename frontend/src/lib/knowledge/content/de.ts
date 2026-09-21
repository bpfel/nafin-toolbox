import type { PartialContent } from '../content'

/**
 * Deutsch, im Schweizer Register: kein ß, also «Beträge» und «lässt», aber
 * «Schliessen» — dieselbe Regel, der `locales/de.ts` schon folgt.
 *
 * Siezen, wie im übrigen Katalog. Und die Wörter, die die Oberfläche ohnehin
 * verwendet: Budget, Konten, Zuordnungen, Momentaufnahme, Wissen, Profil. Ein
 * Rundgang, der die Dinge anders nennt als die Bildschirme, die er erklärt,
 * erklärt gar nichts.
 *
 * Vollständig: Rundgang und Artikel. Das Modul bleibt `Partial` — ein später
 * hinzukommender Artikel darf erst auf Englisch erscheinen, und das Blatt sagt
 * das dann offen, statt die Ersatzsprache als Übersetzung auszugeben.
 *
 * Die Quellen zeigen auf die deutschen Fassungen der amtlichen Seiten. Eine
 * Leserin auf eine englische Seite zu schicken, wäre eine halbe Übersetzung.
 */
export const de: PartialContent = {
  tour: {
    welcome: {
      title: 'Ein Planer',
      body: 'Diese App hat keine Verbindung zu Ihrer Bank und sieht Ihre tatsächlichen Ausgaben nie. Das Budget sagt stattdessen, wie viel bis Ende Monat übrig bleiben muss, damit die anstehenden Verpflichtungen immer gedeckt sind.',
    },
    places: {
      title: 'Die Bildschirme',
      body: 'Budget ist, wo Sie einen Monat planen. Konten zeigt die tatsächlichen Salden dahinter. Wissen beherbergt diesen Rundgang und kurze Texte zu Schweizer Finanzthemen.',
    },
    types: {
      title: 'Verschiedene Budgeteinträge',
      body: 'Es gibt mehrere Arten von Einträgen, die nacheinander vorgestellt werden.',
    },
    budget: {
      title: 'Ein stehender Plan',
      body: 'Kein monatliches Journal. Sie beschreiben einen typischen Monat einmal und erstellen eine benannte Momentaufnahme, wenn sich etwas ändert, das festgehalten werden soll.',
      note: 'Zur Veranschaulichung verwenden wir Schweizer Standardwerte.',
    },
    controls: {
      title: 'Bedienelemente',
      body: 'Alles, was auf den ganzen Bildschirm wirkt, ist hier.',
      hoverNote: 'Fahren Sie mit der Maus über ein Symbol, um zu sehen, was es tut.',
    },
    accounts: {
      title: 'Konten',
      body: 'Hier steht alles, was Sie halten, bei einer Bank oder anderswo. Mit IBAN und den übrigen Angaben können Sie QR-Rechnungen darauf ausstellen.',
    },
    allocations: {
      title: 'Zuordnungen',
      body: 'Hier verknüpfen Sie jeden Budgeteintrag damit, woher sein Geld kommt und wohin es geht. Ihr Lohn landet auf dem Hauptkonto; der Laptop-Topf und die Serafe-Rechnung wandern dorthin, wo sie nicht ausgegeben werden. Daraus ergeben sich die Salden und eine Vorschau der nötigen Reserven.',
    },
    knowledge: {
      title: 'Sie können zurückkommen',
      body: 'Von hier aus startet der Rundgang erneut, neben Texten zu jeder Ansicht und zu Schweizer Geldthemen. Nichts davon müssen Sie sich jetzt merken.',
    },
  },
  articles: {
    'about-budget': {
      title: 'Wozu das Budget da ist',
      body: [
        'Das Budget beschreibt einen typischen Monat: was hereinkommt, was hinausgeht und was zurückgehalten wird. Es ist etwas, das Sie pflegen, und keine Aufzeichnung von Transaktionen — die App sieht Ihre Bank nie.',
        'Einträge stehen unter Überschriften, die Sie selbst wählen. Jeder Eintrag hat eine Art, und die ist entscheidend: Einnahmen und Ausgaben meinen eingehendes und verbrauchtes Geld, während Sparen, Rechnungen und Anschaffungen zwar Ihr Konto verlassen, nicht aber Ihr Vermögen.',
        'Es gibt einen Plan, nicht einen pro Monat. Ändert sich etwas, das es zu behalten lohnt — eine Lohnerhöhung, ein Umzug, eine neue Versicherung —, erstellen Sie eine benannte Momentaufnahme, und er läuft daneben weiter.',
      ],
    },

    'pillar-3a': {
      title: 'Säule 3a',
      body: [
        'Die Säule 3a ist der steuerlich begünstigte Teil der privaten Vorsorge. Einzahlungen können Sie im selben Jahr vom steuerbaren Einkommen abziehen — das ist der wesentliche Grund für ihre Existenz.',
        'Sie ist gedeckelt. Es gibt jedes Jahr einen gesetzlichen Höchstbetrag, und er ist unterschiedlich, je nachdem ob Sie bereits einer Pensionskasse angeschlossen sind. Der Betrag wird vom Bund festgelegt und ändert sich gelegentlich, deshalb steht er hier nicht — die Steuerverwaltung veröffentlicht den aktuellen.',
        'Das Geld ist bis ungefähr zum Rentenalter gebunden. Wenige Ausnahmen bestehen: der Kauf von Wohneigentum zum Eigenbedarf, das endgültige Verlassen der Schweiz und der Schritt in die Selbstständigkeit.',
        'Alles darüber hinaus, und was Sie jederzeit erreichen wollen, ist Säule 3b: gewöhnliches Sparen und Anlegen — keine Obergrenze, kein Abzug.',
      ],
      sources: [
        {
          label: 'ch.ch — die 3. Säule',
          url: 'https://www.ch.ch/de/pensionierung/altersrente/die-3-saeule/',
        },
        {
          label: 'Eidgenössische Steuerverwaltung — Höchstabzüge Säule 3a',
          url: 'https://www.estv.admin.ch/de/zinssaetze-hoechstabzuege-saeule-3a-direkte-bundessteuer',
        },
      ],
    },
  },
}

export default de
