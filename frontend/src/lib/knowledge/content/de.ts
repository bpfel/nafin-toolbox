import type { PartialContent } from '../content'

/**
 * Deutsch, im Schweizer Register: kein ß, also «Beträge» und «lässt», aber
 * «Schliessen» — dieselbe Regel, der `locales/de.ts` schon folgt.
 *
 * Duzen, wie im übrigen Katalog. Und die Wörter, die die Oberfläche ohnehin
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
      body: 'Diese App hat keine Verbindung zu deiner Bank und sieht deine tatsächlichen Ausgaben nie. Das Budget sagt stattdessen, wie viel bis Ende Monat übrig bleiben muss, damit die anstehenden Verpflichtungen immer gedeckt sind.',
    },
    places: {
      title: 'Die Bildschirme',
      body: 'Budget ist, wo du einen Monat planst. Konten zeigt die tatsächlichen Salden dahinter. Wissen beherbergt diesen Rundgang und kurze Texte zu Schweizer Finanzthemen.',
    },
    types: {
      title: 'Verschiedene Budgeteinträge',
      body: 'Es gibt mehrere Arten von Einträgen, die nacheinander vorgestellt werden.',
    },
    budget: {
      title: 'Ein stehender Plan',
      body: 'Kein monatliches Journal. Du beschreibst einen typischen Monat einmal und erstellst eine benannte Momentaufnahme, wenn sich etwas ändert, das festgehalten werden soll.',
      note: 'Zur Veranschaulichung verwenden wir Schweizer Standardwerte.',
    },
    controls: {
      title: 'Bedienelemente',
      body: 'Alle Optionen für den aktuellen Bildschirm sind hier.',
      hoverNote: 'Fahr mit der Maus über ein Symbol, um zu sehen, was es tut.',
    },
    accounts: {
      title: 'Konten',
      body: 'Hier steht alles, was du hältst, bei einer Bank oder anderswo. Mit IBAN und den übrigen Angaben kannst du QR-Rechnungen darauf ausstellen.',
    },
    allocations: {
      title: 'Zuordnungen',
      body: 'Hier verknüpfst du jeden Budgeteintrag damit, woher sein Geld kommt und wohin es geht. Dein Lohn landet auf dem Hauptkonto; der Laptop-Topf und die Serafe-Rechnung wandern dorthin, wo sie nicht ausgegeben werden. Daraus ergeben sich die Salden und eine Vorschau der nötigen Reserven.',
    },
    knowledge: {
      title: 'Du kannst zurückkommen',
      body: 'Von hier aus startet der Rundgang erneut, neben Texten zu jeder Ansicht und zu Schweizer Geldthemen. Nichts davon musst du dir jetzt merken.',
    },
    sharedWhat: {
      title: 'Teile die Freude',
      body: 'Ein Haushalt ist ein zweites Budget, das du mit anderen teilen kannst.',
    },
    sharedStart: {
      title: 'Einrichten',
      body: 'Haushalte verwaltest du im Profil.',
    },
    sharedInvite: {
      title: 'Andere einladen',
      body: 'Klapp einen Haushalt auf, um andere einzuladen. Verwende für die Einladung ihre Konto-E-Mail und gib ihnen den Link zum Teilen — entweder kopiert oder als QR-Code. Du entscheidest, ob sie das geteilte Budget nur lesen oder auch ändern dürfen.',
    },
    sharedSwitch: {
      title: 'Budget wechseln',
      body: 'Sobald du zu einem Haushalt gehörst, verwaltest du mehrere Budgets. Der Punkt zeigt, an welchem du gerade arbeitest, und wechselt zwischen ihnen.',
      wideBody: 'Sobald du zu einem Haushalt gehörst, verwaltest du mehrere Budgets. Die Kopfleiste zeigt, an welchem du gerade arbeitest, und wechselt zwischen ihnen.',
    },
    sharedEntries: {
      title: 'Die verschiedenen Einträge',
      body: 'Ganz wie im persönlichen Budget gibt es im Haushalt dieselben Eintragstypen. Nimm die, die du brauchst, um eure gemeinsamen Ausgaben zu planen.',
      note: 'Die Zahlen hier sind ein Beispiel, für einen Haushalt zu zweit.',
    },
    sharedContributions: {
      title: 'Einnahmen des Haushalts',
      body: 'Die Einnahmenseite eines Haushaltsbudgets ist meist die Summe einzelner Beiträge und nicht ein ganzer Lohn.',
    },
    sharedKnowledge: {
      title: 'Du kannst zurückkommen',
      body: 'Diese Anleitung startet von hier aus wieder, neben der Tour und den Artikeln. Nichts davon musst du dir merken.',
    },
  },
  articles: {
    'about-budget': {
      title: 'Wozu das Budget da ist',
      body: [
        'Das Budget beschreibt einen typischen Monat: was hereinkommt, was hinausgeht und was zurückgehalten wird. Es ist etwas, das du pflegst, und keine Aufzeichnung von Transaktionen — die App sieht deine Bank nie.',
        'Einträge stehen unter Überschriften, die du selbst wählst. Jeder Eintrag hat eine Art, und die ist entscheidend: Einnahmen und Ausgaben meinen eingehendes und verbrauchtes Geld, während Sparen, Rechnungen und Anschaffungen zwar dein Konto verlassen, nicht aber dein Vermögen.',
        'Es gibt einen Plan, nicht einen pro Monat. Ändert sich etwas, das es zu behalten lohnt — eine Lohnerhöhung, ein Umzug, eine neue Versicherung —, erstellst du eine benannte Momentaufnahme, und er läuft daneben weiter.',
      ],
    },

    'pillar-3a': {
      title: 'Säule 3a',
      body: [
        'Die Säule 3a ist der steuerlich begünstigte Teil der privaten Vorsorge. Einzahlungen kannst du im selben Jahr vom steuerbaren Einkommen abziehen — das ist der wesentliche Grund für ihre Existenz.',
        'Sie ist gedeckelt. Es gibt jedes Jahr einen gesetzlichen Höchstbetrag, und er ist unterschiedlich, je nachdem ob du bereits einer Pensionskasse angeschlossen bist. Der Betrag wird vom Bund festgelegt und ändert sich gelegentlich, deshalb steht er hier nicht — die Steuerverwaltung veröffentlicht den aktuellen.',
        'Das Geld ist bis ungefähr zum Rentenalter gebunden. Wenige Ausnahmen bestehen: der Kauf von Wohneigentum zum Eigenbedarf, das endgültige Verlassen der Schweiz und der Schritt in die Selbstständigkeit.',
        'Alles darüber hinaus, und was du jederzeit erreichen willst, ist Säule 3b: gewöhnliches Sparen und Anlegen — keine Obergrenze, kein Abzug.',
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
