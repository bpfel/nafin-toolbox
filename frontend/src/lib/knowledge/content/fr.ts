import type { PartialContent } from '../content'

/**
 * Français, au vouvoiement comme le reste du catalogue, avec l’apostrophe
 * typographique et l’espace avant le deux-points que `locales/fr.ts` emploie
 * déjà.
 *
 * Et les mots que l’interface utilise elle-même : Budget, Comptes,
 * Affectations, instantané, Savoir, Profil. Une visite qui nomme les choses
 * autrement que les écrans qu’elle explique n’explique rien.
 *
 * Les articles manquent encore. C’est permis : ce module est `Partial`,
 * l’anglais transparaît dans les trous, et la fiche le dit franchement plutôt
 * que de faire passer la langue de repli pour une traduction.
 */
export const fr: PartialContent = {
  tour: {
    welcome: {
      title: 'Un planificateur',
      body: 'Nous ne nous connectons pas à vos comptes bancaires et nous ne consultons pas vos dépenses réelles. Le budget définit plutôt ce qui doit rester à la fin du mois, afin que vos engagements financiers à venir soient toujours couverts.',
    },
    places: {
      title: 'Les différents écrans',
      body: 'Budget, c’est là que vous définissez vos flux mensuels. Comptes définit comment l’argent circule entre vos comptes bancaires. Savoir est le point de départ de cette visite et renvoie à des sources officielles sur les finances personnelles suisses. Profil contient vos réglages personnels.',
    },
    types: {
      title: 'Cinq sortes de lignes',
      body: 'Une ligne de budget n’est pas qu’un montant — sa sorte dit ce qu’il advient de l’argent. Nous avons rempli un budget suisse d’exemple pour qu’il y ait quelque chose à regarder ; vous pourrez le modifier ou le réinitialiser ensuite. Les cinq étapes suivantes en prennent une chacune.',
    },
    budget: {
      title: 'Un plan permanent',
      body: 'Pas un journal mensuel. Vous décrivez une seule fois un mois type, et vous prenez un instantané nommé quand quelque chose change assez pour mériter d’être retenu.',
    },
    controls: {
      title: 'Les commandes',
      body: 'Pour agir sur l’écran en cours, utilisez ces commandes.',
      hoverNote: 'Survolez un symbole pour voir ce qu’il fait.',
    },
    accounts: {
      title: 'Où se trouve l’argent',
      body: 'Un compte est un endroit réel avec un solde réel : compte salaire, compte d’épargne, espèces dans un tiroir. Vous indiquez à l’application ce qu’il contient et quand vous avez vérifié pour la dernière fois. Ajoutez un IBAN et les informations qui vont avec, et vous pourrez générer des QR-factures payables sur ce compte.',
    },
    allocations: {
      title: 'Deux vues ici',
      body: 'Comptes liste les soldes. Affectations répond à la question plus difficile — de quel compte sort chaque ligne du budget, et sur lequel elle arrive.',
    },
    knowledge: {
      title: 'Vous pouvez revenir',
      body: 'Cette visite se trouve ici, avec de courts textes sur l’usage de chaque vue et sur le fonctionnement des finances suisses. Rien de ce que vous venez de voir n’est à retenir.',
    },
  },
}

export default fr
