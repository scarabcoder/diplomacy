use diplomacy::geo::builder::ProvinceRegistry;
use diplomacy::geo::{Coast, Map, Province, ProvinceKey, RegionKey, SupplyCenter, Terrain};
use diplomacy::judge::build::{Submission as BuildSubmission, WorldState};
use diplomacy::judge::retreat::{Context as RetreatContext, DestStatus, Start as RetreatStart};
use diplomacy::judge::{
    ConvoyOutcome, IllegalOrder, OrderOutcome, Rulebook, Submission, SupportOutcome,
};
use diplomacy::order::{BuildCommand, ConvoyedMove, MainCommand, MoveCommand, RetreatCommand, SupportedOrder};
use diplomacy::{Nation, ShortName, Unit, UnitPosition, UnitPositions, UnitType};
use serde::{Deserialize, Serialize};
use std::borrow::{Borrow, Cow};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;

type WasmResult<T> = Result<T, JsValue>;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUnit {
    power: String,
    unit_type: String,
    #[serde(default)]
    coast: Option<String>,
}

type AppUnitPositions = BTreeMap<String, AppUnit>;
type AppSupplyCenters = BTreeMap<String, Option<String>>;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppOrder {
    power: String,
    unit_type: String,
    unit_province: String,
    order_type: String,
    #[serde(default)]
    target_province: Option<String>,
    #[serde(default)]
    supported_unit_province: Option<String>,
    #[serde(default)]
    via_convoy: Option<bool>,
    #[serde(default)]
    coast: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppDislodgedUnit {
    power: String,
    unit_type: String,
    province: String,
    #[serde(default)]
    coast: Option<String>,
    dislodged_from: String,
    retreat_options: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppRetreatOrder {
    power: String,
    unit_type: String,
    unit_province: String,
    #[serde(default)]
    retreat_to: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppBuildOrder {
    power: String,
    action: String,
    #[serde(default)]
    unit_type: Option<String>,
    province: String,
    #[serde(default)]
    coast: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidateMainOrdersInput {
    positions: AppUnitPositions,
    orders: Vec<AppOrder>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MainPhaseInput {
    positions: AppUnitPositions,
    orders: Vec<AppOrder>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RetreatPhaseInput {
    current_positions: AppUnitPositions,
    dislodged_units: Vec<AppDislodgedUnit>,
    retreats: Vec<AppRetreatOrder>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPhaseInput {
    positions: AppUnitPositions,
    supply_centers: AppSupplyCenters,
    builds: Vec<AppBuildOrder>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationError {
    unit_province: String,
    message: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidateMainOrdersOutput {
    valid: bool,
    errors: Vec<ValidationError>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppOrderResult {
    order: AppOrder,
    success: bool,
    result_type: String,
    #[serde(default)]
    dislodged_from: Option<String>,
    #[serde(default)]
    retreat_options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MainPhaseOutput {
    order_results: Vec<AppOrderResult>,
    new_positions: AppUnitPositions,
    dislodged_units: Vec<AppDislodgedUnit>,
    standoff_provinces: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppRetreatDisbandedUnit {
    power: String,
    unit_type: String,
    province: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RetreatPhaseOutput {
    new_positions: AppUnitPositions,
    disbanded_units: Vec<AppRetreatDisbandedUnit>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FailedBuild {
    order: AppBuildOrder,
    reason: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildPhaseOutput {
    new_positions: AppUnitPositions,
    executed: Vec<AppBuildOrder>,
    failed: Vec<FailedBuild>,
}

fn world_map() -> &'static Map {
    static WORLD_MAP: OnceLock<Map> = OnceLock::new();
    WORLD_MAP.get_or_init(load_world_map)
}

fn load_world_map() -> Map {
    let mut prov_reg = ProvinceRegistry::default();
    for line in include_str!("standard_map/provinces.csv").lines().skip(1) {
        if let Ok(province) = province_from_line(line) {
            prov_reg
                .register(province)
                .expect("local standard map province should register");
        } else {
            panic!("Failed registering province: {line}");
        }
    }

    let mut region_reg = prov_reg.finish();
    for line in include_str!("standard_map/regions.csv").lines().skip(1) {
        if let Ok((province, coast, terrain)) = region_from_line(line) {
            region_reg
                .register(province, coast, terrain)
                .expect("local standard map region should register");
        } else {
            panic!("Failed registering region: {line}");
        }
    }

    let mut border_reg = region_reg.finish();
    for line in include_str!("standard_map/borders.csv").lines().skip(1) {
        let words = line.split(',').collect::<Vec<_>>();
        border_reg
            .register(words[0], words[1], terrain_from_word(words[2]).unwrap())
            .expect("local standard map border should register");
    }

    border_reg.finish()
}

fn province_from_line(s: &str) -> Result<Province, ()> {
    let words = s.split(',').collect::<Vec<_>>();
    if words.len() == 3 {
        Ok(Province {
            short_name: String::from(words[0]),
            supply_center: supply_center_from_word(words[2]),
        })
    } else {
        Err(())
    }
}

fn supply_center_from_word(s: &str) -> SupplyCenter {
    match s {
        "" => SupplyCenter::None,
        "neutral" => SupplyCenter::Neutral,
        nation => SupplyCenter::Home(nation.into()),
    }
}

fn region_from_line(s: &str) -> Result<(&str, Option<Coast>, Terrain), ()> {
    let words = s.split(',').collect::<Vec<_>>();
    if words.len() == 3 {
        Ok((
            words[0],
            coast_from_word(words[1])?,
            terrain_from_word(words[2])?,
        ))
    } else {
        Err(())
    }
}

fn coast_from_word(s: &str) -> Result<Option<Coast>, ()> {
    match s {
        "" => Ok(None),
        "n" => Ok(Some(Coast::North)),
        "e" => Ok(Some(Coast::East)),
        "s" => Ok(Some(Coast::South)),
        "w" => Ok(Some(Coast::West)),
        _ => Err(()),
    }
}

fn terrain_from_word(s: &str) -> Result<Terrain, ()> {
    match s {
        "sea" => Ok(Terrain::Sea),
        "coast" => Ok(Terrain::Coast),
        "land" => Ok(Terrain::Land),
        _ => Err(()),
    }
}

#[wasm_bindgen(js_name = validateMainOrders)]
pub fn validate_main_orders(input: JsValue) -> WasmResult<JsValue> {
    let input: ValidateMainOrdersInput = from_js(input)?;
    let world = AppMainWorld::from_positions(&input.positions)?;
    let orders = input
        .orders
        .iter()
        .map(|order| map_app_order(order, &world))
        .collect::<Result<Vec<_>, _>>()?;

    let submission = Submission::new(world_map(), &world, orders.clone());
    let outcome = submission.adjudicate(Rulebook::edition_2023());
    let errors = submission
        .submitted_orders()
        .zip(input.orders.iter())
        .filter_map(|(submitted, app_order)| match outcome.get(submitted) {
            Some(OrderOutcome::Illegal(reason)) => Some(ValidationError {
                unit_province: app_order.unit_province.clone(),
                message: format_validation_error(app_order, *reason),
            }),
            _ => None,
        })
        .collect::<Vec<_>>();

    to_js(&ValidateMainOrdersOutput {
        valid: errors.is_empty(),
        errors,
    })
}

#[wasm_bindgen(js_name = adjudicateMainPhase)]
pub fn adjudicate_main_phase(input: JsValue) -> WasmResult<JsValue> {
    let input: MainPhaseInput = from_js(input)?;
    let world = AppMainWorld::from_positions(&input.positions)?;
    let orders = input
        .orders
        .iter()
        .map(|order| map_app_order(order, &world))
        .collect::<Result<Vec<_>, _>>()?;

    let submission = Submission::new(world_map(), &world, orders.clone());
    let outcome = submission.adjudicate(Rulebook::edition_2023());
    let retreat_start = outcome.to_retreat_start();

    let order_results = input
        .orders
        .iter()
        .zip(submission.submitted_orders())
        .map(|(app_order, submitted)| {
            let outcome = outcome
                .get(submitted)
                .ok_or_else(|| js_err("Missing adjudication outcome for submitted order"))?;

            let result_type = map_main_result_type(outcome);
            let dislodged_from = match outcome {
                OrderOutcome::Hold(diplomacy::judge::HoldOutcome::Dislodged(by))
                | OrderOutcome::Convoy(ConvoyOutcome::Dislodged(by)) => {
                    Some(rust_province_to_app(by.region.province().short_name().as_ref()))
                }
                _ => None,
            };

            let retreat_options = retreat_start
                .dislodged()
                .keys()
                .find(|order| **order == submitted)
                .and_then(|order| retreat_start.retreat_destinations().get(&order.unit_position()))
                .map(|destinations| {
                    destinations
                        .available()
                        .into_iter()
                        .map(|region| rust_region_to_app(region))
                        .collect::<Vec<_>>()
                });

            Ok(AppOrderResult {
                order: app_order.clone(),
                success: bool::from(diplomacy::judge::OrderState::from(outcome)),
                result_type,
                dislodged_from,
                retreat_options,
            })
        })
        .collect::<Result<Vec<_>, JsValue>>()?;

    let new_positions = positions_from_unit_positions(retreat_start.unit_positions());
    let dislodged_units = retreat_start
        .dislodged()
        .iter()
        .map(|(dislodged, dislodger)| {
            let retreat_options = retreat_start
                .retreat_destinations()
                .get(&dislodged.unit_position())
                .map(|destinations| {
                    destinations
                        .available()
                        .into_iter()
                        .map(|region| rust_region_to_app(region))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            Ok(AppDislodgedUnit {
                power: nation_to_app_power(&dislodged.nation)?,
                unit_type: unit_type_to_app(dislodged.unit_type),
                province: rust_province_to_app(dislodged.region.province().short_name().as_ref()),
                coast: dislodged.region.coast().map(coast_to_app),
                dislodged_from: rust_province_to_app(
                    dislodger.region.province().short_name().as_ref(),
                ),
                retreat_options,
            })
        })
        .collect::<Result<Vec<_>, JsValue>>()?;

    to_js(&MainPhaseOutput {
        order_results,
        new_positions,
        dislodged_units,
        standoff_provinces: Vec::new(),
    })
}

#[wasm_bindgen(js_name = adjudicateRetreatPhase)]
pub fn adjudicate_retreat_phase(input: JsValue) -> WasmResult<JsValue> {
    let input: RetreatPhaseInput = from_js(input)?;
    let current_world = AppMainWorld::from_positions(&input.current_positions)?;

    let retreater_orders = input
        .dislodged_units
        .iter()
        .map(map_dislodged_unit_to_main_order)
        .collect::<Result<Vec<_>, _>>()?;
    let dislodger_orders = input
        .dislodged_units
        .iter()
        .map(map_dislodger_placeholder)
        .collect::<Result<Vec<_>, _>>()?;

    let dislodged = retreater_orders
        .iter()
        .zip(dislodger_orders.iter())
        .collect::<HashMap<_, _>>();

    let retreat_destinations = input
        .dislodged_units
        .iter()
        .zip(retreater_orders.iter())
        .map(|(dislodged_unit, retreater)| {
            let destinations = dislodged_unit
                .retreat_options
                .iter()
                .map(|region| {
                    let leaked_region: &'static RegionKey = Box::leak(Box::new(
                        parse_destination_region(
                            region,
                            retreater.region.clone(),
                            retreater.unit_type,
                            &current_world,
                        )?,
                    ));

                    Ok((leaked_region, DestStatus::Available))
                })
                .collect::<Result<Vec<_>, JsValue>>()?;

            Ok((retreater.unit_position(), destinations))
        })
        .collect::<Result<HashMap<_, _>, JsValue>>()?;

    let current_positions = current_world.unit_positions();
    let retreat_start = unsafe {
        RetreatStart::from_raw_parts(dislodged, retreat_destinations, current_positions)
    };

    let retreat_orders = input
        .retreats
        .iter()
        .map(|order| map_retreat_order(order, &input.dislodged_units, &current_world))
        .collect::<Result<Vec<_>, _>>()?;

    let context = RetreatContext::new(&retreat_start, retreat_orders);
    let outcome = context.resolve();

    let new_positions = positions_from_unit_positions(outcome.unit_positions());
    let disbanded_units = outcome
        .order_outcomes()
        .filter(|(_, order_outcome)| order_outcome.did_disband())
        .map(|(order, _)| AppRetreatDisbandedUnit {
            power: nation_to_app_power(&order.nation).unwrap_or_else(|_| String::from("unknown")),
            unit_type: unit_type_to_app(order.unit_type),
            province: rust_province_to_app(order.region.province().short_name().as_ref()),
        })
        .collect::<Vec<_>>();

    to_js(&RetreatPhaseOutput {
        new_positions,
        disbanded_units,
    })
}

#[wasm_bindgen(js_name = adjudicateBuildPhase)]
pub fn adjudicate_build_phase(input: JsValue) -> WasmResult<JsValue> {
    let input: BuildPhaseInput = from_js(input)?;
    let world = AppBuildWorld::new(&input.positions, &input.supply_centers)?;
    let mapped_builds = input
        .builds
        .iter()
        .filter(|order| order.action != "waive")
        .map(|order| map_build_order(order, &world))
        .collect::<Result<Vec<_>, _>>()?;

    let build_submission =
        BuildSubmission::new(world_map(), world.last_time(), &world, mapped_builds.clone());
    let outcome = build_submission.adjudicate(Rulebook::edition_2023());

    let new_positions = positions_from_unit_positions(outcome.to_final_unit_positions());
    let order_lookup = input
        .builds
        .iter()
        .filter(|order| order.action != "waive")
        .zip(mapped_builds.iter())
        .map(|(app, mapped)| (mapped.clone(), app.clone()))
        .collect::<HashMap<_, _>>();

    let mut executed = input
        .builds
        .iter()
        .filter(|order| order.action == "waive")
        .cloned()
        .collect::<Vec<_>>();
    let mut failed = Vec::new();

    for (order, order_outcome) in outcome.order_outcomes() {
        let Some(app_order) = order_lookup.get(order) else {
            continue;
        };

        if bool::from(diplomacy::judge::OrderState::from(*order_outcome)) {
            executed.push(app_order.clone());
        } else {
            failed.push(FailedBuild {
                order: app_order.clone(),
                reason: format_build_failure(*order_outcome),
            });
        }
    }

    to_js(&BuildPhaseOutput {
        new_positions,
        executed,
        failed,
    })
}

fn from_js<T: for<'de> Deserialize<'de>>(value: JsValue) -> WasmResult<T> {
    serde_wasm_bindgen::from_value(value)
        .map_err(|err| JsValue::from_str(&format!("Failed to decode input: {err}")))
}

fn to_js<T: Serialize>(value: &T) -> WasmResult<JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value
        .serialize(&serializer)
        .map_err(|err| JsValue::from_str(&format!("Failed to encode output: {err}")))
}

fn js_err(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

fn app_power_to_nation(power: &str) -> WasmResult<Nation> {
    let code = match power {
        "england" => "ENG",
        "france" => "FRA",
        "germany" => "GER",
        "russia" => "RUS",
        "austria" => "AUS",
        "italy" => "ITA",
        "turkey" => "TUR",
        other => return Err(js_err(format!("Unknown power: {other}"))),
    };

    Ok(Nation::from(code))
}

fn nation_to_app_power(nation: &Nation) -> WasmResult<String> {
    match nation.short_name().as_ref() {
        "ENG" => Ok(String::from("england")),
        "FRA" => Ok(String::from("france")),
        "GER" => Ok(String::from("germany")),
        "RUS" => Ok(String::from("russia")),
        "AUS" => Ok(String::from("austria")),
        "ITA" => Ok(String::from("italy")),
        "TUR" => Ok(String::from("turkey")),
        other => Err(js_err(format!("Unknown nation: {other}"))),
    }
}

fn app_unit_type_to_rust(unit_type: &str) -> WasmResult<UnitType> {
    match unit_type {
        "army" => Ok(UnitType::Army),
        "fleet" => Ok(UnitType::Fleet),
        other => Err(js_err(format!("Unknown unit type: {other}"))),
    }
}

fn unit_type_to_app(unit_type: UnitType) -> String {
    match unit_type {
        UnitType::Army => String::from("army"),
        UnitType::Fleet => String::from("fleet"),
    }
}

fn coast_to_app(coast: diplomacy::geo::Coast) -> String {
    match coast {
        diplomacy::geo::Coast::North => String::from("nc"),
        diplomacy::geo::Coast::East => String::from("ec"),
        diplomacy::geo::Coast::South => String::from("sc"),
        diplomacy::geo::Coast::West => String::from("wc"),
    }
}

fn app_province_to_rust(province: &str) -> String {
    match province {
        "gol" => String::from("lyo"),
        "mid" => String::from("mao"),
        "nat" => String::from("nao"),
        "nrg" => String::from("nwg"),
        "tyn" => String::from("tys"),
        other => String::from(other),
    }
}

fn rust_province_to_app(province: &str) -> String {
    match province {
        "lyo" => String::from("gol"),
        "mao" => String::from("mid"),
        "nao" => String::from("nat"),
        "nwg" => String::from("nrg"),
        "tys" => String::from("tyn"),
        other => String::from(other),
    }
}

fn parse_region_string(input: &str) -> (String, Option<String>) {
    if let Some((province, coast)) = input.split_once('/') {
        return (app_province_to_rust(province), Some(coast.to_string()));
    }

    if let Some((province, rest)) = input.split_once('(') {
        let coast = rest.trim_end_matches(')').to_string();
        return (app_province_to_rust(province), Some(coast));
    }

    (app_province_to_rust(input), None)
}

fn parse_region(province: &str, coast: Option<&str>) -> WasmResult<RegionKey> {
    let province = app_province_to_rust(province);
    if let Some(coast) = coast {
        let canonical = format!("{province}({coast})");
        return canonical
            .parse()
            .map_err(|err| js_err(format!("Invalid region {canonical}: {err}")));
    }

    province
        .parse()
        .map_err(|err| js_err(format!("Invalid region {province}: {err}")))
}

fn parse_unit_region(
    province: &str,
    coast: Option<&str>,
    unit_type: UnitType,
) -> WasmResult<RegionKey> {
    if unit_type == UnitType::Fleet && coast.is_some() {
        parse_region(province, coast)
    } else {
        parse_region(province, None)
    }
}

fn parse_destination_region(
    input: &str,
    from_region: RegionKey,
    unit_type: UnitType,
    world: &AppMainWorld,
) -> WasmResult<RegionKey> {
    let (province, parsed_coast) = parse_region_string(input);
    if let Some(coast) = parsed_coast.as_deref() {
        return parse_region(&province, Some(coast));
    }

    if unit_type == UnitType::Fleet {
        let bordering = world_map()
            .find_bordering(&from_region)
            .into_iter()
            .filter(|region| region.province() == &ProvinceKey::from(province.clone()))
            .cloned()
            .collect::<Vec<_>>();

        if bordering.len() == 1 {
            return Ok(bordering[0].clone());
        }
    }

    let _ = world;
    parse_region(&province, None)
}

fn rust_region_to_app(region: &RegionKey) -> String {
    if let Some(coast) = region.coast() {
        return format!(
            "{}/{}",
            rust_province_to_app(region.province().short_name().as_ref()),
            coast_to_app(coast),
        );
    }

    rust_province_to_app(region.province().short_name().as_ref())
}

fn app_unit_to_position(province: &str, unit: &AppUnit) -> WasmResult<UnitPosition<'static, RegionKey>> {
    let nation = app_power_to_nation(&unit.power)?;
    let unit_type = app_unit_type_to_rust(&unit.unit_type)?;
    let region = parse_unit_region(province, unit.coast.as_deref(), unit_type)?;

    Ok(UnitPosition::new(
        Unit::new(Cow::Owned(nation), unit_type),
        region,
    ))
}

fn positions_from_unit_positions<'a, L>(
    positions: impl IntoIterator<Item = UnitPosition<'a, L>>,
) -> AppUnitPositions
where
    L: Borrow<RegionKey>,
{
    positions
        .into_iter()
        .map(|position| {
            let region = position.region.borrow();
            (
                rust_province_to_app(region.province().short_name().as_ref()),
                AppUnit {
                    power: nation_to_app_power(position.unit.nation())
                        .unwrap_or_else(|_| String::from("unknown")),
                    unit_type: unit_type_to_app(position.unit.unit_type()),
                    coast: region.coast().map(coast_to_app),
                },
            )
        })
        .collect()
}

#[derive(Debug, Clone)]
struct AppMainWorld {
    positions: Vec<UnitPosition<'static, RegionKey>>,
}

impl AppMainWorld {
    fn from_positions(positions: &AppUnitPositions) -> WasmResult<Self> {
        let positions = positions
            .iter()
            .map(|(province, unit)| app_unit_to_position(province, unit))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self { positions })
    }

    fn unit_at(&self, province: &str) -> Option<&UnitPosition<'static, RegionKey>> {
        let province = ProvinceKey::from(app_province_to_rust(province));
        self.positions
            .iter()
            .find(|position| position.region.province() == &province)
    }
}

impl UnitPositions<RegionKey> for AppMainWorld {
    fn unit_positions(&self) -> Vec<UnitPosition<'_, &RegionKey>> {
        self.positions.iter().map(UnitPosition::as_region_ref).collect()
    }

    fn find_province_occupier(&self, province: &ProvinceKey) -> Option<UnitPosition<'_, &RegionKey>> {
        self.positions
            .iter()
            .find(|position| position.region.province() == province)
            .map(UnitPosition::as_region_ref)
    }

    fn find_region_occupier(&self, region: &RegionKey) -> Option<Unit<'_>> {
        self.positions
            .iter()
            .find(|position| &position.region == region)
            .map(|position| position.unit.clone())
    }
}

#[derive(Debug, Clone)]
struct AppBuildWorld {
    positions: Vec<UnitPosition<'static, RegionKey>>,
    units_by_nation: HashMap<Nation, HashSet<(UnitType, RegionKey)>>,
    occupiers: HashMap<ProvinceKey, Nation>,
    last_time: HashMap<ProvinceKey, Nation>,
    nations: Vec<Nation>,
}

impl AppBuildWorld {
    fn new(positions: &AppUnitPositions, supply_centers: &AppSupplyCenters) -> WasmResult<Self> {
        let current_positions = positions
            .iter()
            .map(|(province, unit)| app_unit_to_position(province, unit))
            .collect::<Result<Vec<_>, _>>()?;

        let mut units_by_nation = HashMap::<Nation, HashSet<(UnitType, RegionKey)>>::new();
        let mut occupiers = HashMap::<ProvinceKey, Nation>::new();

        for position in &current_positions {
            units_by_nation
                .entry(position.unit.nation().clone())
                .or_default()
                .insert((position.unit.unit_type(), position.region.clone()));
            occupiers.insert(position.region.province().clone(), position.unit.nation().clone());
        }

        let mut last_time = HashMap::new();
        for (province, owner) in supply_centers {
            let Some(owner) = owner else {
                continue;
            };
            last_time.insert(
                ProvinceKey::from(app_province_to_rust(province)),
                app_power_to_nation(owner)?,
            );
        }

        let nations = ["england", "france", "germany", "russia", "austria", "italy", "turkey"]
            .into_iter()
            .map(app_power_to_nation)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            positions: current_positions,
            units_by_nation,
            occupiers,
            last_time,
            nations,
        })
    }

    fn last_time(&self) -> &HashMap<ProvinceKey, Nation> {
        &self.last_time
    }
}

impl WorldState for AppBuildWorld {
    fn nations(&self) -> HashSet<&Nation> {
        self.nations.iter().collect()
    }

    fn occupier(&self, province: &ProvinceKey) -> Option<&Nation> {
        self.occupiers.get(province)
    }

    fn unit_count(&self, nation: &Nation) -> u8 {
        self.units_by_nation
            .get(nation)
            .map(|units| units.len() as u8)
            .unwrap_or(0)
    }

    fn units(&self, nation: &Nation) -> HashSet<(UnitType, RegionKey)> {
        self.units_by_nation
            .get(nation)
            .cloned()
            .unwrap_or_default()
    }
}

fn map_app_order(order: &AppOrder, world: &AppMainWorld) -> WasmResult<diplomacy::judge::MappedMainOrder> {
    let nation = app_power_to_nation(&order.power)?;
    let (unit_type, unit_region) = if let Some(position) = world.unit_at(&order.unit_province) {
        (position.unit.unit_type(), position.region.clone())
    } else {
        let unit_type = app_unit_type_to_rust(&order.unit_type)?;
        let unit_region = parse_unit_region(&order.unit_province, None, unit_type)?;
        (unit_type, unit_region)
    };

    let command = match order.order_type.as_str() {
        "hold" => MainCommand::Hold,
        "move" => {
            let target = order
                .target_province
                .as_deref()
                .ok_or_else(|| js_err("Move order requires targetProvince"))?;
            let destination = parse_destination_region(target, unit_region.clone(), unit_type, world)?;
            if order.via_convoy.unwrap_or(false) {
                MainCommand::Move(MoveCommand::with_mandatory_convoy(destination))
            } else {
                MainCommand::Move(MoveCommand::new(destination))
            }
        }
        "support" => {
            let supported_unit_province = order
                .supported_unit_province
                .as_deref()
                .ok_or_else(|| js_err("Support order requires supportedUnitProvince"))?;
            let supported = world
                .unit_at(supported_unit_province)
                .ok_or_else(|| js_err(format!("No unit at {supported_unit_province} to support")))?;
            let supported_region = supported.region.clone();
            let supported_type = supported.unit.unit_type();

            if let Some(target) = order.target_province.as_deref() {
                let destination = parse_destination_region(
                    target,
                    supported_region.clone(),
                    supported_type,
                    world,
                )?;
                MainCommand::Support(SupportedOrder::Move(
                    supported_type,
                    supported_region,
                    destination,
                ))
            } else {
                MainCommand::Support(SupportedOrder::Hold(supported_type, supported_region))
            }
        }
        "convoy" => {
            let supported_unit_province = order
                .supported_unit_province
                .as_deref()
                .ok_or_else(|| js_err("Convoy order requires supportedUnitProvince"))?;
            let target = order
                .target_province
                .as_deref()
                .ok_or_else(|| js_err("Convoy order requires targetProvince"))?;
            let supported = world
                .unit_at(supported_unit_province)
                .ok_or_else(|| js_err(format!("No unit at {supported_unit_province} to convoy")))?;
            let destination = parse_destination_region(
                target,
                supported.region.clone(),
                supported.unit.unit_type(),
                world,
            )?;
            MainCommand::Convoy(ConvoyedMove::new(supported.region.clone(), destination))
        }
        other => return Err(js_err(format!("Unknown order type: {other}"))),
    };

    Ok(diplomacy::order::Order::new(
        nation,
        unit_type,
        unit_region,
        command,
    ))
}

fn map_dislodged_unit_to_main_order(
    dislodged: &AppDislodgedUnit,
) -> WasmResult<diplomacy::judge::MappedMainOrder> {
    let nation = app_power_to_nation(&dislodged.power)?;
    let unit_type = app_unit_type_to_rust(&dislodged.unit_type)?;
    let region = parse_unit_region(&dislodged.province, dislodged.coast.as_deref(), unit_type)?;

    Ok(diplomacy::order::Order::new(
        nation,
        unit_type,
        region,
        MainCommand::Hold,
    ))
}

fn map_dislodger_placeholder(
    dislodged: &AppDislodgedUnit,
) -> WasmResult<diplomacy::judge::MappedMainOrder> {
    let nation = app_power_to_nation(&dislodged.power)?;
    let unit_type = app_unit_type_to_rust(&dislodged.unit_type)?;
    let region = parse_region(&dislodged.dislodged_from, None)?;

    Ok(diplomacy::order::Order::new(
        nation,
        unit_type,
        region,
        MainCommand::Hold,
    ))
}

fn map_retreat_order(
    order: &AppRetreatOrder,
    dislodged_units: &[AppDislodgedUnit],
    world: &AppMainWorld,
) -> WasmResult<diplomacy::judge::MappedRetreatOrder> {
    let dislodged = dislodged_units
        .iter()
        .find(|unit| unit.province == order.unit_province)
        .ok_or_else(|| js_err(format!("No dislodged unit at {}", order.unit_province)))?;
    let nation = app_power_to_nation(&order.power)?;
    let unit_type = app_unit_type_to_rust(&order.unit_type)?;
    let region = parse_unit_region(&order.unit_province, dislodged.coast.as_deref(), unit_type)?;
    let command = match order.retreat_to.as_deref() {
        Some(destination) => RetreatCommand::Move(parse_destination_region(
            destination,
            region.clone(),
            unit_type,
            world,
        )?),
        None => RetreatCommand::Hold,
    };

    Ok(diplomacy::order::Order::new(nation, unit_type, region, command))
}

fn map_build_order(
    order: &AppBuildOrder,
    world: &AppBuildWorld,
) -> WasmResult<diplomacy::judge::MappedBuildOrder> {
    let nation = app_power_to_nation(&order.power)?;
    let region = match order.action.as_str() {
        "build" => {
            let unit_type = app_unit_type_to_rust(
                order
                    .unit_type
                    .as_deref()
                    .ok_or_else(|| js_err("Build action requires unitType"))?,
            )?;
            parse_unit_region(&order.province, order.coast.as_deref(), unit_type)?
        }
        "disband" => {
            let province = ProvinceKey::from(app_province_to_rust(&order.province));
            let current = world
                .positions
                .iter()
                .find(|position| position.region.province() == &province)
                .ok_or_else(|| js_err(format!("No unit at {} to disband", order.province)))?;
            current.region.clone()
        }
        other => return Err(js_err(format!("Unknown build action: {other}"))),
    };
    let unit_type = if order.action == "build" {
        app_unit_type_to_rust(
            order
                .unit_type
                .as_deref()
                .ok_or_else(|| js_err("Build action requires unitType"))?,
        )?
    } else {
        world
            .positions
            .iter()
            .find(|position| {
                position.region.province()
                    == &ProvinceKey::from(app_province_to_rust(&order.province))
            })
            .map(|position| position.unit.unit_type())
            .ok_or_else(|| js_err(format!("No unit at {} to disband", order.province)))?
    };

    let command = match order.action.as_str() {
        "build" => BuildCommand::Build,
        "disband" => BuildCommand::Disband,
        other => return Err(js_err(format!("Unknown build action: {other}"))),
    };

    Ok(diplomacy::order::Order::new(nation, unit_type, region, command))
}

fn format_validation_error(order: &AppOrder, reason: IllegalOrder) -> String {
    match reason {
        IllegalOrder::NoUnit => format!("No unit at {}", order.unit_province),
        IllegalOrder::ForeignUnit => format!("Unit at {} does not belong to {}", order.unit_province, order.power),
        IllegalOrder::MultipleToSameUnit => {
            format!("Multiple orders were submitted for {}", order.unit_province)
        }
        IllegalOrder::UnreachableDestination => {
            let target = order.target_province.as_deref().unwrap_or("the target");
            format!("{} cannot reach {}", order.unit_province, target)
        }
    }
}

fn map_main_result_type(outcome: &OrderOutcome<&diplomacy::judge::MappedMainOrder>) -> String {
    match outcome {
        OrderOutcome::Illegal(_) => String::from("void"),
        OrderOutcome::Hold(diplomacy::judge::HoldOutcome::Succeeds) => String::from("executed"),
        OrderOutcome::Hold(diplomacy::judge::HoldOutcome::Dislodged(_)) => String::from("dislodged"),
        OrderOutcome::Move(diplomacy::judge::AttackOutcome::Succeeds) => String::from("executed"),
        OrderOutcome::Move(diplomacy::judge::AttackOutcome::MoveToSelf)
        | OrderOutcome::Move(diplomacy::judge::AttackOutcome::NoPath) => String::from("void"),
        OrderOutcome::Move(_) => String::from("bounced"),
        OrderOutcome::Support(SupportOutcome::NotDisrupted) => String::from("executed"),
        OrderOutcome::Support(SupportOutcome::CutBy(_)) => String::from("cut"),
        OrderOutcome::Support(_) => String::from("void"),
        OrderOutcome::Convoy(ConvoyOutcome::NotDisrupted) => String::from("executed"),
        OrderOutcome::Convoy(ConvoyOutcome::Dislodged(_)) => String::from("dislodged"),
        OrderOutcome::Convoy(_) => String::from("void"),
    }
}

fn format_build_failure(outcome: diplomacy::judge::build::OrderOutcome) -> String {
    use diplomacy::judge::build::OrderOutcome as BuildOutcome;

    match outcome {
        BuildOutcome::RedeploymentProhibited => String::from("Cannot mix builds and disbands"),
        BuildOutcome::InvalidProvince => String::from("Invalid build province"),
        BuildOutcome::ForeignControlled => String::from("Province is not controlled by this power"),
        BuildOutcome::OccupiedProvince => String::from("Province is occupied"),
        BuildOutcome::InvalidTerrain => String::from("Invalid terrain for this unit"),
        BuildOutcome::DisbandingNonexistentUnit => String::from("No unit exists to disband"),
        BuildOutcome::DisbandingForeignUnit => String::from("Cannot disband another power's unit"),
        BuildOutcome::AllBuildsUsed => String::from("No builds remaining"),
        BuildOutcome::AllDisbandsUsed => String::from("No disbands remaining"),
        BuildOutcome::Succeeds => String::from("Succeeded"),
    }
}
