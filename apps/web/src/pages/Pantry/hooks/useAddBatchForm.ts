import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { translateApiError } from '@/i18n/translateApiError';
import { useToast } from '@pocket-pantry/ui';
import {
  FALLBACK_LOCATION,
  useCatalogSearch,
  type CatalogAllergen,
  type CatalogSearchResult,
  type StorageLocation,
  type Unit,
} from '@/lib/catalog';
import { barcodeLine } from '@/lib/barcode';
import { isValidBarcode } from '@/lib/gtin';
import type { CameraMode } from '@/lib/cameraMode';
import { type ProposedLine } from '@/lib/scan';
import { defaultAmount } from '@/lib/usualAmounts';
import type { CameraResult } from '@/components/scan/camera/CameraOverlay/CameraOverlay';
import {
  defaultExpiryDate,
  parseAmountText,
  useAddBatch,
  type Batch,
  type IsoDate,
} from '@/lib/pantry';

/**
 * What the form starts with, from an open Ingredient card: the Ingredient (its id and name; the
 * form looks up its Catalog defaults), or the typed name of an Unmatched one.
 */
export type AddBatchStart =
  | { ingredient: Pick<CatalogSearchResult, 'id' | 'name'> }
  | { unmatchedName: string };

/** The fields Prefill fills, and that are marked until the Member edits them. */
export type PrefillField = 'ingredient' | 'amount' | 'expiry' | 'description';

/** The picked Ingredient: a Catalog search result, or a starting one whose defaults are still loading. */
type PickedIngredient = Pick<CatalogSearchResult, 'id' | 'name'> &
  Partial<CatalogSearchResult>;

/** Add-Batch form state: Catalog defaults pre-fill Location and expiry, and the Member can override them. */
export function useAddBatchForm({
  onSaved,
  start,
  presetLocation,
}: {
  /** Called with the Batch the save created. */
  onSaved: (batch: Batch) => void;
  start?: AddBatchStart;
  /** A shelf card's Location: it wins over each pick's Catalog default, camera picks included. */
  presetLocation?: StorageLocation;
}) {
  const { t, i18n } = useTranslation();
  const addBatch = useAddBatch();

  const [startingIngredient] = useState(() =>
    start && 'ingredient' in start ? start.ingredient : null,
  );
  const [ingredient, setIngredient] = useState<PickedIngredient | null>(
    startingIngredient,
  );
  // The text the search field holds when it is not being typed in: the starting Ingredient's name,
  // or the Unmatched name; later a Barcode Lookup's product name when no Ingredient matched.
  const [initialQuery, setInitialQuery] = useState(() =>
    start === undefined
      ? ''
      : 'ingredient' in start
        ? start.ingredient.name
        : start.unmatchedName,
  );
  const [unmatchedName, setUnmatchedName] = useState<string | null>(() =>
    start && 'unmatchedName' in start ? start.unmatchedName : null,
  );
  const [quantity, setQuantity] = useState('');
  // The Member's own unit choice, or none: then the picked Ingredient's default unit applies.
  const [chosenUnit, setChosenUnit] = useState<Unit | null>(null);
  // The unit a dropped Ingredient had on screen: kept while its name is edited, never carried to the next pick.
  const [frozenUnit, setFrozenUnit] = useState<Unit | null>(null);
  const unit: Unit = chosenUnit ?? frozenUnit ?? ingredient?.defaultUnit ?? 'g';
  const [location, setLocation] = useState<StorageLocation>(
    presetLocation ?? FALLBACK_LOCATION,
  );
  const [expiryDate, setExpiryDate] = useState<IsoDate | null>(null);
  const [description, setDescription] = useState('');

  // `touched`: the Member has set the field, so Prefill leaves it alone. A form opened from an
  // Ingredient's row has its Ingredient set from the start.
  const [touched, setTouched] = useState({
    location: false,
    expiry: false,
    ingredient: start !== undefined,
    amount: false,
    description: false,
  });
  const touch = (field: keyof typeof touched) =>
    setTouched((was) => ({ ...was, [field]: true }));
  // Fields Prefill filled and the Member has not edited since, and whether its Ingredient match is shaky.
  const [prefilled, setPrefilled] = useState<ReadonlySet<PrefillField>>(
    new Set(),
  );
  const [checkIngredient, setCheckIngredient] = useState(false);
  // Where the camera's values came from, shown as a tag until the Member changes the Ingredient.
  const [source, setSource] = useState<'photo' | 'scanned' | null>(null);
  // The product the camera read, shown in the token beside that tag.
  const [productName, setProductName] = useState<string | null>(null);
  const edit = (field: PrefillField) => {
    touch(field);
    setPrefilled((was) => {
      const next = new Set(was);
      next.delete(field);
      return next;
    });
    if (field === 'ingredient') {
      setCheckIngredient(false);
      setSource(null);
    }
  };

  /** An amount in the form's own notation ("0,5" in ro and da), so it parses back as typed text does. */
  const typedAmount = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      useGrouping: false,
      maximumFractionDigits: 3,
    }).format(value);
  /** The Ingredient's usual amount, as the amount a pick starts with. */
  const usualAmountText = (
    result: Pick<CatalogSearchResult, 'defaultUnit' | 'amountScale'>,
  ) => typedAmount(defaultAmount(result.defaultUnit, result.amountScale));

  const selectIngredient = (result: CatalogSearchResult) => {
    edit('ingredient');
    setIngredient(result);
    setUnmatchedName(null);
    // A frozen unit belonged to the dropped Ingredient: the new one's default applies.
    setFrozenUnit(null);
    // Keep an amount the Member typed (or Prefill read) before the pick ("2 kg", then Parmesan), with its unit.
    // Otherwise the new Ingredient's usual amount and unit apply.
    if (
      quantity.trim() === '' ||
      (!touched.amount && !prefilled.has('amount'))
    ) {
      setChosenUnit(null);
      setQuantity(usualAmountText(result));
    }
    setLocation(
      presetLocation ?? result.defaults.location ?? FALLBACK_LOCATION,
    );
    const days = result.defaults.expiryDays;
    setExpiryDate(days === null ? null : defaultExpiryDate(days, new Date()));
  };

  // A starting Ingredient has only its id and name: its Catalog defaults come from searching its
  // name, which the search field has already asked for, and apply as if it had been picked there
  // (so it then shows as the picked token).
  const startingLookup = useCatalogSearch(startingIngredient?.name ?? '');
  const startingDefaults = startingLookup.data?.find(
    (result) => result.id === startingIngredient?.id,
  );
  // The fields stay editable while the lookup is out: what the Member sets in that time is kept.
  // The lookup can also miss (the name search may not return the id): the save still sends the
  // starting `ingredientId`, and Location and expiry stay on their fallbacks.
  useEffect(() => {
    if (!startingDefaults || ingredient !== startingIngredient) return;
    setIngredient(startingDefaults);
    if (!touched.location)
      setLocation(
        presetLocation ??
          startingDefaults.defaults.location ??
          FALLBACK_LOCATION,
      );
    if (!touched.amount && quantity.trim() === '')
      setQuantity(usualAmountText(startingDefaults));
    const days = startingDefaults.defaults.expiryDays;
    if (!touched.expiry && !prefilled.has('expiry'))
      setExpiryDate(days === null ? null : defaultExpiryDate(days, new Date()));
    // Once, when the lookup lands; not again after the Member has picked or typed something else.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only startingDefaults: the other values are read as they are at that moment
  }, [startingDefaults]);

  /** Dropping the picked Ingredient must not change the unit on screen: freeze the Ingredient's unit first. */
  const clearIngredient = () => {
    if (ingredient && chosenUnit === null) setFrozenUnit(unit);
    setIngredient(null);
  };

  const changeQuery = () => {
    edit('ingredient');
    clearIngredient();
    setUnmatchedName(null);
  };

  const chooseTypedName = (name: string) => {
    edit('ingredient');
    setUnmatchedName(name);
    clearIngredient();
    setExpiryDate(null);
  };

  const { value: quantityValue, valid: quantityValid } =
    parseAmountText(quantity);
  const canSave =
    (ingredient !== null || Boolean(unmatchedName)) &&
    quantityValid &&
    !addBatch.isPending;

  /**
   * Writes a Product Scan's line into the fields the Member has not touched and marks them. Location
   * and expiry keep the Catalog-default fallback when the line gives none.
   */
  // The Member's own Ingredient (picked or typed) is not overwritten by Prefill; one they cleared leaves nothing to protect.
  const ingredientTouched =
    touched.ingredient && (ingredient !== null || unmatchedName !== null);
  const applyPrefill = (
    read: ProposedLine,
    /** With no Match: keep the read name as a typed Unmatched name (a Known Barcode's saved name), or pre-type it in the Ingredient search (Product Scan, Barcode Lookup). */
    noMatch: 'typed-name' | 'search' = 'typed-name',
  ) => {
    const marks = new Set<PrefillField>();
    const matched = ingredientTouched ? null : read.match;
    if (!ingredientTouched) {
      if (read.match) {
        setIngredient(read.match);
        setUnmatchedName(null);
        setFrozenUnit(null);
        setCheckIngredient(read.lowConfidence);
        marks.add('ingredient');
      } else if (noMatch === 'search') {
        // No confident match: an earlier untouched pick would be wrong for this product.
        setIngredient(null);
        setUnmatchedName(null);
        setCheckIngredient(false);
        setPrefilled((was) => {
          const next = new Set(was);
          next.delete('ingredient');
          return next;
        });
        if (read.name.trim()) setInitialQuery(read.name.trim());
      } else if (read.name.trim()) {
        setIngredient(null);
        setUnmatchedName(read.name.trim());
        setCheckIngredient(false);
        marks.add('ingredient');
      }
    }
    if (matched && !touched.location)
      setLocation(
        presetLocation ?? matched.defaults.location ?? FALLBACK_LOCATION,
      );
    if (!touched.expiry) {
      if (read.expiryDate) {
        setExpiryDate(read.expiryDate as IsoDate);
        marks.add('expiry');
      } else if (!ingredientTouched) {
        const days = matched?.defaults.expiryDays ?? null;
        setExpiryDate(
          days === null ? null : defaultExpiryDate(days, new Date()),
        );
      }
    }
    if (!touched.amount && read.quantity !== null) {
      // In the form's own notation ("0,5" in ro and da), so it parses back as typed text does.
      setQuantity(typedAmount(read.quantity));
      setChosenUnit(read.unit);
      marks.add('amount');
    } else if (!touched.amount && matched) {
      // No pack size read: the matched Ingredient's usual amount.
      setQuantity(usualAmountText(matched));
      setChosenUnit(null);
    }
    if (!touched.description && read.productDescription) {
      setDescription(read.productDescription);
      marks.add('description');
    }
    setPrefilled((was) => new Set([...was, ...marks]));
  };
  // The read outlives the render that started it: it fills what is untouched when it lands.
  const prefillNow = useRef(applyPrefill);
  useLayoutEffect(() => {
    prefillNow.current = applyPrefill;
  });

  const [cameraOpen, setCameraOpen] = useState(false);
  // The mode the overlay opens in.
  const [openMode, setOpenMode] = useState<CameraMode>('barcode');
  // The camera closed with Type it: the form puts focus in the search.
  const [typeRequested, setTypeRequested] = useState(false);
  // Values came from Open Food Facts: the form credits it (ODbL).
  const [fromOpenFoodFacts, setFromOpenFoodFacts] = useState(false);
  // The Allergens the last Barcode Lookup listed, and those the matched Ingredient is not tagged with.
  const [lookupAllergens, setLookupAllergens] = useState<{
    listed: CatalogAllergen[];
    missing: CatalogAllergen[];
  }>({ listed: [], missing: [] });
  // The barcode the Batch is saved with, so the Family learns it (a Known Barcode). Set by whatever
  // supplied one: a Barcode Lookup, an unknown code the Member typed the Ingredient for, a barcode
  // decoded from a Product photo. The Batch stores none.
  const [barcodeToSend, setBarcodeToSend] = useState<string | null>(null);
  const toast = useToast();
  const openCamera = (mode: CameraMode) => {
    setOpenMode(mode);
    setTypeRequested(false);
    setCameraOpen(true);
  };
  // Counts camera results: a photo's barcode that lands after a newer result is dropped.
  const cameraResults = useRef(0);
  const onCameraResult = (result: CameraResult) => {
    const current = ++cameraResults.current;
    setCameraOpen(false);
    setFromOpenFoodFacts(false);
    setLookupAllergens({ listed: [], missing: [] });
    setBarcodeToSend(null);
    if (result.kind === 'type') {
      setTypeRequested(true);
      setBarcodeToSend(result.code);
      return;
    }
    if (result.kind === 'product') {
      void result.barcode.then((code) => {
        if (code && current === cameraResults.current) setBarcodeToSend(code);
      });
      const { read } = result;
      const ingredientPicked = ingredientTouched;
      prefillNow.current(read, 'search');
      // The Member's own Ingredient pick is not "From photo", and the toast only speaks of what the read did.
      const name = read.name.trim() || read.productDescription || '';
      // Only a matched pick is "From photo": with no match nothing is picked yet.
      if (!ingredientPicked && read.match) {
        setSource('photo');
        setProductName(name || null);
      }
      if (ingredientPicked) return;
      if (read.match || !name)
        toast.show(t('pantry:form.toast.photo'), { polite: true });
      else
        toast.show(t('pantry:form.toast.noMatch', { name }), { polite: true });
      return;
    }
    const { lookup } = result;
    // A Known Barcode saved under a typed name fills that name; otherwise no match pre-types the search.
    prefillNow.current(
      barcodeLine(lookup),
      lookup.unmatchedName === undefined ? 'search' : 'typed-name',
    );
    if (lookup.match) {
      setSource('scanned');
      setProductName(lookup.productDescription || null);
    }
    setFromOpenFoodFacts(lookup.source === 'open_food_facts');
    setLookupAllergens({
      // Pre-tick only for a new Ingredient: a confident match is not created.
      listed: lookup.match ? [] : lookup.allergens,
      missing: lookup.missingAllergens,
    });
    setBarcodeToSend(result.code);
    toast.show(
      t('pantry:form.toast.barcode', {
        name: lookup.unmatchedName ?? lookup.productDescription,
      }),
      { polite: true },
    );
  };
  const camera = {
    open: cameraOpen,
    /** Opens the overlay in `mode`: Product (photo) or Barcode. */
    openCamera,
    cancel: () => setCameraOpen(false),
    onResult: onCameraResult,
    /** The mode the overlay opens in. */
    openMode,
    /** The camera closed with Type it: put focus in the search. */
    typeRequested,
    source,
    productName,
    fromOpenFoodFacts,
    /** Ids to pre-tick for a new Family Ingredient; undefined when none are listed (never []). */
    listedAllergenIds: lookupAllergens.listed.length
      ? lookupAllergens.listed.map((allergen) => allergen.id)
      : undefined,
    /** Listed Allergens the matched Ingredient lacks: shown while the looked-up match is still picked. */
    missingAllergens: prefilled.has('ingredient')
      ? lookupAllergens.missing
      : [],
    prefilled,
    checkIngredient,
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    addBatch.mutate(
      {
        ...(ingredient
          ? { ingredientId: ingredient.id }
          : { rawName: unmatchedName as string }),
        quantity: quantityValue,
        unit: quantityValue === null ? null : unit,
        location,
        expiryDate,
        productDescription: description.trim() || null,
        // Never a code the API rejects: it would fail the save.
        ...(barcodeToSend && isValidBarcode(barcodeToSend)
          ? { barcode: barcodeToSend }
          : {}),
      },
      { onSuccess: (batch) => onSaved(batch) },
    );
  };

  return {
    ingredient,
    /** The picked Ingredient as the search field's token: only once its Catalog result is on hand. */
    selected: ingredient?.parentCategory
      ? (ingredient as CatalogSearchResult)
      : null,
    initialQuery,
    unmatchedName,
    quantity,
    unit,
    location,
    expiryDate,
    /** The Catalog default Location of the picked Ingredient; null when it has none (or is not known yet). */
    usualLocation: ingredient?.defaults?.location ?? null,
    /** The picked Ingredient's Leaf Category name, for "usual for {leaf}"; its own name until the Catalog result lands. */
    leafName: ingredient?.leafCategory?.name ?? ingredient?.name ?? null,
    /** The Default Expiry in days for the "Usual" quick pick: only for a chosen Ingredient that has one. */
    usualDays: ingredient?.defaults?.expiryDays ?? null,
    description,
    canSave,
    quantityValid,
    saving: addBatch.isPending,
    error: addBatch.error ? translateApiError(t, addBatch.error) : null,
    selectIngredient,
    changeQuery,
    chooseTypedName,
    setQuantity: (value: string) => {
      edit('amount');
      setQuantity(value);
    },
    setUnit: (value: Unit) => {
      edit('amount');
      setChosenUnit(value);
    },
    setLocation: (value: StorageLocation) => {
      touch('location');
      setLocation(value);
    },
    setExpiryDate: (value: IsoDate | null) => {
      edit('expiry');
      setExpiryDate(value);
    },
    setDescription: (value: string) => {
      edit('description');
      setDescription(value);
    },
    submit,
    camera,
  };
}
