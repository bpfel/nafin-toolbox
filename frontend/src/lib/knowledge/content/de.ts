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
 * Die Artikel fehlen hier noch. Das ist erlaubt: dieses Modul ist `Partial`,
 * Englisch scheint durch die Lücken, und das Blatt sagt es offen, statt die
 * Ersatzsprache als Übersetzung auszugeben.
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
      title: 'Fünf Arten von Zeilen',
      body: 'Eine Budgetzeile ist nicht nur ein Betrag — ihre Art sagt, was mit dem Geld geschieht. Wir haben ein Schweizer Beispielbudget eingesetzt, damit es etwas zu sehen gibt; Sie können es danach ändern oder zurücksetzen. Die nächsten fünf Schritte nehmen je eine Art.',
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
      title: 'Wo das Geld liegt',
      body: 'Ein Konto ist ein realer Ort mit einem realen Saldo: Lohnkonto, Sparkonto, Bargeld in der Schublade. Sie sagen der App, was darauf liegt und wann Sie zuletzt nachgesehen haben. Mit IBAN und den übrigen Angaben können Sie QR-Rechnungen erstellen, die auf dieses Konto lauten.',
    },
    allocations: {
      title: 'Zwei Ansichten',
      body: 'Konten zeigt die Salden. Zuordnungen beantwortet die schwierigere Frage — von welchem Konto jede Budgetzeile abgeht und auf welches sie geht.',
    },
    knowledge: {
      title: 'Sie können zurückkommen',
      body: 'Dieser Rundgang liegt hier, zusammen mit kurzen Texten dazu, wofür jede Ansicht da ist und wie Schweizer Geldthemen funktionieren. Nichts davon müssen Sie sich jetzt merken.',
    },
  },
}

export default de
