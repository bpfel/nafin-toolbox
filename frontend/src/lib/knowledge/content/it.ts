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
      title: 'Un pianificatore',
      body: 'Non ci colleghiamo ai tuoi conti bancari e non guardiamo le tue spese effettive. Il budget stabilisce invece quanto deve restare alla fine del mese, in modo che gli impegni finanziari futuri siano sempre coperti.',
    },
    places: {
      title: 'Le diverse schermate',
      body: 'Budget è dove definisci i tuoi flussi mensili. Conti definisce come il denaro si muove tra i tuoi conti bancari. Sapere è la sede di questo tour e rimanda a fonti ufficiali sulle finanze personali svizzere. Profilo contiene le tue impostazioni personali.',
    },
    types: {
      title: 'Cinque tipi di riga',
      body: 'Una riga di budget non è solo un importo — il suo tipo dice che cosa succede al denaro. Abbiamo inserito un budget svizzero di esempio così che ci sia qualcosa da guardare; potrai modificarlo o azzerarlo dopo. I cinque passi successivi ne prendono uno ciascuno.',
    },
    budget: {
      title: 'Un piano permanente',
      body: 'Non un registro mensile. Descrivi una volta sola un mese tipico e scatti un’istantanea con un nome quando qualcosa cambia abbastanza da valerne la pena.',
    },
    controls: {
      title: 'I comandi',
      body: 'Per agire sulla schermata corrente, usa questi comandi.',
      hoverNote: 'Passa il puntatore su un simbolo per vedere che cosa fa.',
    },
    accounts: {
      title: 'Dove si trova il denaro',
      body: 'Un conto è un luogo reale con un saldo reale: conto stipendio, conto di risparmio, contanti in un cassetto. Dici all’app quanto contiene e quando hai controllato l’ultima volta. Aggiungi un IBAN e i dati che lo accompagnano, e potrai generare QR-fatture pagabili su questo conto.',
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
