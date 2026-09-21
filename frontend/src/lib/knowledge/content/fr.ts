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
      title: 'Un plan, pas une banque',
      body: 'Rien ici n’est relié à vos comptes bancaires. Chaque montant est un montant que vous avez saisi, et il reste juste parce que vous l’entretenez — c’est aussi pourquoi personne d’autre ne peut le lire.',
    },
    places: {
      title: 'Quatre endroits',
      body: 'Budget, c’est ce que vous planifiez. Comptes, c’est là où l’argent se trouve vraiment. Savoir, c’est cette visite et une petite bibliothèque. Profil, c’est vous plutôt que votre argent.',
    },
    budget: {
      title: 'Un plan permanent',
      body: 'Pas un journal mensuel. Vous décrivez une seule fois un mois type, et vous prenez un instantané nommé quand quelque chose change assez pour mériter d’être retenu.',
    },
    controls: {
      title: 'Les commandes de l’écran',
      body: 'Tout ce qui agit sur l’écran entier est ici — modifier sa structure, masquer les montants. Sur un téléphone, elles s’empilent au-dessus de ce point, là où se trouve déjà votre pouce.',
    },
    privacy: {
      title: 'L’œil masque les montants',
      body: 'Il floute chaque montant et laisse les libellés lisibles, pour le train ou un bureau partagé. Maintenez appuyé pour jeter un coup d’œil. C’est cosmétique — ce n’est pas le verrou de vos données.',
    },
    accounts: {
      title: 'Où se trouve l’argent',
      body: 'Un compte est un endroit réel avec un solde réel : compte salaire, compte d’épargne, espèces dans un tiroir. Vous indiquez à l’application ce qu’il contient et quand vous avez vérifié pour la dernière fois.',
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
