# État de liste conservé en session

L'action `List.html()` conserve les paramètres d'affichage dans la session serveur. Le stockage est commun au tri,
aux colonnes et aux autres propriétés de la liste qui héritent de `Parameter`. Il ne repose ni sur `localStorage`, ni
sur un cookie contenant directement les valeurs : le cookie identifie la session, dont le contenu dépend du store
configuré par l'application.

## Cycle normal de chargement et de sauvegarde

À chaque rendu HTML normal, `List.html()` exécute les opérations dans cet ordre :

1. `load()` recherche l'état dans `request.session.list[routeOf(type)]` ;
2. chaque propriété de `List` qui est une instance de `Parameter` reçoit sa valeur avec `unserialize()` ;
3. `getParams()` applique les paramètres de la requête ou initialise les valeurs absentes ;
4. `save()` appelle `serialize()` sur chaque `Parameter` et remplace l'état de la route dans la session ;
5. la recherche et le rendu utilisent cet état final.

La requête dédiée à l'ordre des colonnes suit le chemin plus court décrit dans la section correspondante. Elle
s'arrête après la sauvegarde et ne déclenche pas les étapes de recherche et de rendu.

La clé `routeOf(type)` isole les préférences de chaque classe métier. La structure sauvegardée ressemble à ceci :

```ts
request.session.list[routeOf(type)] = {
	columns: ['name', 'email', 'createdAt'],
	feed: undefined,
	filter: { name: 'Alice', email: '', createdAt: '' },
	sort: [['name', false], ['createdAt', true]]
}
```

Les tuples de `sort` respectent l'ordre de priorité. Leur booléen vaut `true` pour un tri descendant et `false` pour un
tri ascendant.

## Tri des colonnes

Un clic sur un en-tête construit une requête vers l'action du formulaire avec `sort=<propriété>` et, pour le sens
descendant, le paramètre `reverse`. La réponse remplace la cible `main`.

Après le chargement de session, `Sort.getParams()` procède ainsi :

- si `Sort.sorted` vient de la session, ses clés et ses booléens deviennent la priorité et le sens du tri ;
- en l'absence d'état de session, il utilise d'abord une option de stockage `Sort`, puis les métadonnées retournées
  par `sortOf(type)` ;
- si la requête contient `sort`, la propriété demandée passe en première position et prend le sens transmis, tandis
  que les autres critères restent dans leur ordre précédent.

`Sort.serialize()` sauvegarde ensuite les tuples ordonnés dans la session. Au rendu suivant, cet état est donc utilisé à
la place des valeurs issues des options de stockage ou de la réflexion.

## Ordre et suppression des colonnes

Le plugin `TableColumnReorder` déplace toutes les cellules de la colonne pendant le drag. Lorsqu'un drop modifie
réellement sa position, son callback `onReorder` :

1. relit les en-têtes `th[data-property]` dans leur nouvel ordre DOM ;
2. encode chaque nom de propriété, puis les concatène dans un unique paramètre `columns` séparé par des virgules ;
3. envoie un `fetch()` discret avec `keepalive`, sans modifier le DOM.

Par exemple, la requête contient conceptuellement :

```text
?columns=name,email,createdAt
```

À sa position d'origine, la colonne conserve la teinte grise sans icône. À une autre position, elle prend une teinte
bleue légère et affiche des flèches horizontales à gauche du nom. Revenir à la position initiale rétablit le gris et
retire les flèches.

Si le pointeur passe avant la première colonne de données (y compris sur les cases à cocher), après la dernière,
ou au-dessus ou en dessous du tableau, les cellules de la colonne prennent une teinte rouge légère et une croix rouge apparaît
à gauche du nom. Revenir dans la zone des données retire cet indicateur. Relâcher dans une zone de suppression retire
les cellules de toutes les lignes et l'éventuel `col`, puis appelle `onRemove`, qui sauvegarde les colonnes restantes
avec la même requête. Échap ou `pointercancel` annule le geste et restaure l'ordre initial sans sauvegarde.

Le serveur accepte aussi plusieurs paramètres `columns` pour rester compatible avec l'ancien format. Dans les deux
cas, `Columns.getParams()` découpe les valeurs séparées par des virgules.

La requête dédiée charge la session et applique le nouvel ordre. Elle sauvegarde immédiatement tous les `Parameter`
restaurés, puis retourne une réponse vide `204`, avant `Feed.getParams()`, `Filter.getParams()`, `Sort.getParams()` et
tout accès au `DataSource`. La table déjà réordonnée par le plugin, les lignes ajoutées par le feed et la position de
scroll restent donc intactes.

La valeur reçue n'est appliquée que si elle contient des propriétés connues, sans doublon, parmi celles retournées par
`ListReflectClass(type).listProperties()`. Une liste réduite masque les colonnes retirées ; `columns=` retire toutes les
colonnes de données. Les propriétés inconnues et les doublons sont rejetés. Même si la valeur est invalide, la requête dédiée sauvegarde l'état précédemment
chargé, ou l'état réfléchi par défaut en son absence, et retourne `204` sans lancer de rendu.

Si aucun nouvel ordre n'est transmis, les colonnes restaurées par `Columns.unserialize()` sont conservées. Les
fonctions de réflexion ne sont rappelées comme valeur par défaut que lorsque la session ne contient encore aucune
configuration de colonnes. Une configuration vide restaurée reste vide. Enfin, `Columns.serialize()` sauvegarde les noms dans leur ordre courant. Le drop devient donc effectif pour
tous les rendus suivants de la même liste pendant la session en cours.

Pour rendre les données, chaque objet chargé est associé à des `ReflectProperty` liées à cet objet par
`Columns.propertiesOf()`. Le feed parcourt ces propriétés dans l'ordre de `Columns`, au lieu de rappeler
`listProperties()` sur l'objet. Les cellules suivent ainsi le même état de session que les en-têtes, tout en conservant
les transformations d'affichage des valeurs.

Ce mécanisme implique qu'un nouvel ordre défini par réflexion ne remplace pas une préférence déjà présente dans la
session. Pour reprendre immédiatement l'ordre réfléchi après une évolution des métadonnées, il faut supprimer l'entrée
de la liste concernée dans la session ou démarrer une nouvelle session.
