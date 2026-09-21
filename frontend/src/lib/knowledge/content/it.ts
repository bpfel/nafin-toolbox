import type { PartialContent } from '../content'

/**
 * Italiano, con il «tu» come nel resto del catalogo — che dà del tu dove il
 * tedesco e il francese danno del Lei — e con l’apostrofo tipografico.
 *
 * E le parole che l’interfaccia usa già: Budget, Conti, Assegnazioni,
 * istantanea, Sapere, Profilo. Un tour che chiama le cose diversamente dalle
 * schermate che spiega non spiega nulla.
 *
 * Gli articoli mancano ancora. È ammesso: questo modulo è `Partial`, l’inglese
 * traspare nei vuoti, e la scheda lo dice apertamente invece di far passare la
 * lingua di ripiego per una traduzione.
 */
export const it: PartialContent = {
  tour: {
    welcome: {
      title: 'Un piano, non una banca',
      body: 'Qui non c’è alcun collegamento ai tuoi conti bancari. Ogni importo l’hai inserito tu, e resta corretto perché sei tu a tenerlo aggiornato — ed è anche per questo che nessun altro può leggerlo.',
    },
    places: {
      title: 'Quattro luoghi',
      body: 'Budget è ciò che pianifichi. Conti è dove il denaro si trova davvero. Sapere è questo tour e una piccola biblioteca. Profilo riguarda te, non il tuo denaro.',
    },
    budget: {
      title: 'Un piano permanente',
      body: 'Non un registro mensile. Descrivi una volta sola un mese tipico e scatti un’istantanea con un nome quando qualcosa cambia abbastanza da valerne la pena.',
    },
    controls: {
      title: 'I comandi della schermata',
      body: 'Tutto ciò che agisce sull’intera schermata è qui — modificarne la struttura, nascondere gli importi. Sul telefono si impilano sopra questo punto, dove il pollice si trova già.',
    },
    privacy: {
      title: 'L’occhio nasconde gli importi',
      body: 'Sfoca ogni importo e lascia leggibili le etichette, per il treno o una scrivania condivisa. Tieni premuto per dare un’occhiata. È estetico — non è il blocco dei tuoi dati.',
    },
    accounts: {
      title: 'Dove si trova il denaro',
      body: 'Un conto è un luogo reale con un saldo reale: conto stipendio, conto di risparmio, contanti in un cassetto. Dici all’app quanto contiene e quando hai controllato l’ultima volta.',
    },
    allocations: {
      title: 'Due viste qui',
      body: 'Conti elenca i saldi. Assegnazioni risponde alla domanda più difficile — da quale conto esce ogni riga del budget e su quale entra.',
    },
    knowledge: {
      title: 'Puoi tornare qui',
      body: 'Questo tour si trova qui, insieme a brevi testi su a cosa serve ogni vista e su come funzionano le finanze svizzere. Non devi ricordare nulla di ciò che hai appena visto.',
    },
  },
}

export default it
