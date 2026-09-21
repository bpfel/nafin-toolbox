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
      body: 'Wir greifen nicht auf Ihre Bankkonten zu und sehen Ihre tatsächlichen Ausgaben nicht. Das Budget legt stattdessen fest, was bis Ende Monat übrig bleiben muss, damit künftige finanzielle Verpflichtungen immer gedeckt sind.',
    },
    places: {
      title: 'Die Bildschirme',
      body: 'Budget ist, wo Sie Ihre monatlichen Geldflüsse festlegen. Konten legt fest, wie Geld zwischen Ihren Bankkonten fliesst. Wissen ist das Zuhause dieses Rundgangs und verweist auf offizielle Quellen zu Schweizer Finanzthemen. Profil enthält Ihre persönlichen Einstellungen.',
    },
    types: {
      title: 'Verschiedene Budgeteinträge',
      body: 'Das Budget kennt mehrere Arten, die gleich vorgestellt werden.',
    },
    budget: {
      title: 'Ein stehender Plan',
      body: 'Kein Monatsjournal. Sie beschreiben einmal einen typischen Monat und erstellen eine benannte Momentaufnahme, wenn sich etwas ändert, das es wert ist.',
    },
    controls: {
      title: 'Bedienelemente',
      body: 'Um auf dem aktuellen Bildschirm etwas zu tun, verwenden Sie diese Bedienelemente.',
      hoverNote: 'Fahren Sie mit der Maus über ein Symbol, um zu sehen, was es tut.',
    },
    accounts: {
      title: 'Konten',
      body: 'Auf diesem Bildschirm stehen alle Ihre Bankkonten. Wenn Sie die IBAN und die übrigen Angaben erfassen, können Sie QR-Rechnungen erstellen, die auf dieses Konto lauten.',
    },
    allocations: {
      title: 'Zuordnungen',
      body: 'Hier verknüpfen Sie Ihre Budgeteinträge mit Konten. Ihr Lohn kommt zum Beispiel auf dem Hauptkonto an. Um auf den Laptop zu sparen und Geld für die Serafe-Rechnung zurückzulegen, können Sie es auf ein anderes Konto überweisen. Daraus ergeben sich ein Saldo je Konto und eine Vorschau der nötigen Reserven.',
    },
    knowledge: {
      title: 'Sie können zurückkommen',
      body: 'Dieser Rundgang liegt hier, zusammen mit kurzen Texten dazu, wofür jede Ansicht da ist und wie Schweizer Geldthemen funktionieren. Nichts davon müssen Sie sich jetzt merken.',
    },
  },
  articles: {
    'about-budget': {
      title: 'Wozu das Budget da ist',
      body: [
        'Das Budget beschreibt einen typischen Monat: was hereinkommt, was hinausgeht und was zurückgehalten wird. Es ist ein Plan, den Sie pflegen, und keine Aufzeichnung von Transaktionen — die App sieht Ihre Bank nie.',
        'Einträge stehen unter Überschriften, die Sie selbst wählen. Jeder Eintrag hat eine Art, und auf die kommt es an: Einnahmen und Ausgaben sind Geld, das kommt, und Geld, das weg ist, während Sparen, Rechnungen und Anschaffungen zwar Ihr Konto verlassen, nicht aber Ihr Vermögen.',
        'Es gibt einen Plan, nicht einen pro Monat. Ändert sich etwas, das es zu behalten lohnt — eine Lohnerhöhung, ein Umzug, eine neue Versicherung —, erstellen Sie eine benannte Momentaufnahme, und der Plan läuft daneben weiter.',
      ],
    },

    'pillar-3a': {
      title: 'Säule 3a',
      body: [
        'Die Säule 3a ist der steuerlich begünstigte Teil der privaten Vorsorge. Was Sie in einem Jahr einzahlen, können Sie in diesem Jahr vom steuerbaren Einkommen abziehen — das ist der wesentliche Grund, weshalb es sie gibt.',
        'Sie ist gedeckelt. Es gibt jedes Jahr einen gesetzlichen Höchstbetrag, und er ist unterschiedlich, je nachdem ob Sie bereits einer Pensionskasse angeschlossen sind. Der Betrag wird vom Bund festgelegt und ändert sich von Zeit zu Zeit, deshalb steht er hier nicht — die Steuerverwaltung veröffentlicht den aktuellen.',
        'Das Geld ist bis ungefähr zum Rentenalter gebunden. Es gibt wenige Ausnahmen, darunter der Kauf von Wohneigentum zum Eigenbedarf, das endgültige Verlassen der Schweiz und der Schritt in die Selbstständigkeit.',
        'Alles darüber hinaus, und alles, woran Sie jederzeit herankommen wollen, ist Säule 3b: gewöhnliches Sparen und Anlegen, ohne Obergrenze und ohne Abzug.',
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
