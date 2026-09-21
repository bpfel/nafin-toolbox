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
      title: 'Ein Plan, keine Bank',
      body: 'Nichts hier ist mit Ihren Bankkonten verbunden. Jede Zahl haben Sie selbst erfasst, und sie stimmt, solange Sie sie pflegen — genau darum kann sie auch sonst niemand lesen.',
    },
    places: {
      title: 'Vier Orte',
      body: 'Budget ist, was Sie planen. Konten ist, wo das Geld tatsächlich liegt. Wissen sind dieser Rundgang und eine kleine Bibliothek. Profil betrifft Sie selbst, nicht Ihr Geld.',
    },
    budget: {
      title: 'Ein stehender Plan',
      body: 'Kein Monatsjournal. Sie beschreiben einmal einen typischen Monat und erstellen eine benannte Momentaufnahme, wenn sich etwas ändert, das es wert ist.',
    },
    controls: {
      title: 'Die Bedienelemente des Bildschirms',
      body: 'Alles, was auf den ganzen Bildschirm wirkt, ist hier — den Aufbau bearbeiten, die Beträge verbergen. Auf dem Handy stapeln sie sich über diesem Punkt, dort, wo Ihr Daumen ohnehin liegt.',
    },
    privacy: {
      title: 'Das Auge verbirgt die Beträge',
      body: 'Es macht jede Zahl unkenntlich und lässt die Bezeichnungen lesbar — für den Zug oder den geteilten Schreibtisch. Gedrückt halten, um kurz hinzusehen. Das ist kosmetisch und nicht die Sperre Ihrer Daten.',
    },
    accounts: {
      title: 'Wo das Geld liegt',
      body: 'Ein Konto ist ein realer Ort mit einem realen Saldo: Lohnkonto, Sparkonto, Bargeld in der Schublade. Sie sagen der App, was darauf liegt und wann Sie zuletzt nachgesehen haben.',
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
