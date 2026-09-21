import type { PartialContent } from '../content'

/**
 * Italiano, con il «tu» come nel resto del catalogo — che dà del tu dove il
 * tedesco e il francese danno del Lei — e con l’apostrofo tipografico.
 *
 * E le parole che l’interfaccia usa già: Budget, Conti, Assegnazioni,
 * istantanea, Sapere, Profilo. Un tour che chiama le cose diversamente dalle
 * schermate che spiega non spiega nulla.
 *
 * Completo: il tour e gli articoli. Il modulo resta `Partial` — un articolo
 * aggiunto in seguito può esistere dapprima solo in inglese, e la scheda lo
 * dirà apertamente invece di far passare la lingua di ripiego per una
 * traduzione.
 *
 * Le fonti rimandano alle versioni italiane delle pagine ufficiali. Mandare un
 * lettore italofono su una pagina inglese sarebbe una traduzione a metà.
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
      title: 'Diverse voci di budget',
      body: 'Il budget contiene diversi tipi, presentati qui di seguito.',
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
      title: 'Conti',
      body: 'Questa schermata contiene tutti i tuoi conti bancari. Se aggiungi l’IBAN e i dati che lo accompagnano, potrai generare QR-fatture pagabili su questo conto.',
    },
    allocations: {
      title: 'Assegnazioni',
      body: 'Qui colleghi le tue voci di budget ai conti. Lo stipendio, per esempio, arriva sul conto principale. Per mettere da parte il computer portatile e accantonare la fattura Serafe, potresti trasferire quel denaro su un altro conto. Ne risultano un saldo per conto e una proiezione delle riserve necessarie.',
    },
    knowledge: {
      title: 'Puoi tornare qui',
      body: 'Questo tour si trova qui, insieme a brevi testi su a cosa serve ogni vista e su come funzionano le finanze svizzere. Non devi ricordare nulla di ciò che hai appena visto.',
    },
  },
  articles: {
    'about-budget': {
      title: 'A cosa serve il budget',
      body: [
        'Il budget descrive un mese tipico: che cosa entra, che cosa esce e che cosa viene tenuto da parte. È un piano che aggiorni tu, non un registro dei movimenti — l’app non vede mai la tua banca.',
        'Le voci stanno sotto intestazioni che scegli tu. Ogni voce ha un tipo, ed è quello che conta: entrate e uscite sono denaro che arriva e denaro che se n’è andato, mentre risparmi, fatture e acquisti lasciano il tuo conto senza lasciare il tuo patrimonio.',
        'C’è un solo piano, non uno al mese. Quando qualcosa cambia abbastanza da valere la pena di ricordarlo — un aumento, un trasloco, una nuova assicurazione — scatta un’istantanea con un nome: il piano continua a vivere accanto a essa.',
      ],
    },

    'pillar-3a': {
      title: 'Pilastro 3a',
      body: [
        'Il pilastro 3a è la parte fiscalmente privilegiata della previdenza privata. Quanto versi in un anno lo puoi dedurre dal reddito imponibile di quell’anno, ed è in buona parte la ragione per cui esiste.',
        'Ha un tetto. Ogni anno c’è un importo massimo di legge, diverso a seconda che tu sia già affiliato a una cassa pensioni oppure no. L’importo è fissato dalla Confederazione e cambia di tanto in tanto, perciò qui non è riportato: quello in vigore lo pubblica l’amministrazione delle contribuzioni.',
        'Il denaro resta vincolato fin verso l’età di pensionamento, con poche eccezioni: acquistare un’abitazione in cui vivi, lasciare definitivamente la Svizzera, oppure metterti in proprio.',
        'Tutto ciò che va oltre quel tetto, e tutto ciò a cui vuoi poter accedere, è pilastro 3b: risparmio e investimenti ordinari, senza tetto e senza deduzione.',
      ],
      sources: [
        {
          label: 'ch.ch — il 3° pilastro',
          url: 'https://www.ch.ch/it/pensionamento/rendita-di-vecchiaia/il-3-pilastro/',
        },
        {
          label: 'Amministrazione federale delle contribuzioni — deduzioni massime pilastro 3a',
          url: 'https://www.estv.admin.ch/it/tassi-interesse-deduzioni-massime-pilastro-3a-imposta-federale-diretta',
        },
      ],
    },
  },
}

export default it
