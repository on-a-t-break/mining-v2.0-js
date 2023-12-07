  const miningContractName = "terraminingx";
  const [miningParams, setMiningParams] = useState({});
  const [miningParamsLoading, setMiningParamsLoading] = useState(true);
  async function fetchMiningParams(){
    setMiningParamsLoading(true);
    try {
      let newMiningParams = {};
      let newBLKHL = {};
      let newRSRCH = {};
      //////
      let fetchMiningParams = await rpc.get_table_rows({
        code: miningContractName,
        scope: miningContractName,
        table: "config",
        limit: 1,
        lower_bound: "",
        upper_bound: "",
        json: true,
      });
      if (fetchMiningParams["rows"]){
        let resultRows = fetchMiningParams["rows"][0]["params"];

        let allowed_schemas_holder = {};
        for (let a = 0; a < resultRows["allowed_schemas"].length; a++){
          let schema_pointer = resultRows["allowed_schemas"][a];
          allowed_schemas_holder[schema_pointer["key"]] = schema_pointer["value"];
        }
        newMiningParams["allowed_schemas"] = allowed_schemas_holder;

        let template_mp_redef_holder = {};
        for (let a = 0; a < resultRows["template_mp_redef"].length; a++){
          let template_pointer = resultRows["template_mp_redef"][a];
          template_mp_redef_holder[template_pointer["key"]] = template_pointer["value"];
        }

        newMiningParams["template_mp_redef"] = template_mp_redef_holder;
        newMiningParams["balance_knob1"] = resultRows["balance_knob1"];
        newMiningParams["balance_knob2"] = resultRows["balance_knob2"];
        newMiningParams["mine_cap"] = resultRows["mine_cap"];
        newMiningParams["mine_delay"] = resultRows["mine_delay"];
        newMiningParams["mine_fee"] = resultRows["mine_fee"];
        newMiningParams["helper_fee"] = resultRows["helper_fee"];
        newMiningParams["powerpool_ratio"] = resultRows["powerpool_ratio"];
      }
      //////
      let fetchMiningPools = await rpc.get_table_rows({
        code: miningContractName,
        scope: miningContractName,
        table: "powerpools",
        limit: 1,
        lower_bound: "",
        upper_bound: "",
        json: true,
      });
      if (fetchMiningPools["rows"]){
        let resultRows = fetchMiningPools["rows"][0]["params"];

        let schema_holder = {};
        for (let a = 0; a < resultRows["schema_count"].length; a++){
          schema_holder[resultRows["schema_count"][a]["key"]] = resultRows["schema_count"][a]["value"];
        }
        newMiningParams["schema_count"] = schema_holder;

        newBLKHL = resultRows["pools"][0]["value"];
        newRSRCH = resultRows["pools"][1]["value"];
      }
      //////
      let fetchMiningBalance = await rpc.get_table_rows({
        code: "terraformers",
        scope: miningContractName,
        table: "accounts",
        limit: 2,
        lower_bound: "",
        upper_bound: "",
        json: true,
      });
      if (fetchMiningBalance["rows"]){
        newBLKHL["Balance"] = fetchMiningBalance["rows"][1]["balance"].split(" ")[0];
        newRSRCH["Balance"] = fetchMiningBalance["rows"][0]["balance"].split(" ")[0];
        newBLKHL["Balance2"] = 151369.036632910;
        newRSRCH["Balance2"] = 17628063.57668330;
      }
      newMiningParams["BLKHL"] = newBLKHL;
      newMiningParams["RSRCH"] = newRSRCH;

      console.log(newMiningParams);
      setMiningParams(newMiningParams);
      setMiningParamsLoading(false);
    } catch (e) {
      console.log(e);
      setMiningParamsLoading(true);
    }
  };

  function handleMiningPower(asset){
    let first_mining_power = 0;
    if (asset["data"]["mining power"]){
      first_mining_power = parseFloat(asset["data"]["mining power"]);
    }
    if (miningParams["template_mp_redef"][asset["template"]["template_id"]]){
      first_mining_power = parseFloat(miningParams["template_mp_redef"][asset["template"]["template_id"]]);
    }

    let schema_params = miningParams["allowed_schemas"][asset["schema"]["schema_name"]];
    first_mining_power += parseFloat(schema_params["buff"]);

    let pool_pointer = miningParams[schema_params["pool"]];

    let genesis_multi = schema_params["genesis"] === 1 && pool_pointer["genesis_enabled"] === 1 ? parseFloat(pool_pointer["global_pool"]) / parseFloat(pool_pointer["genesis_pool"]) : 1;

    let gadget_bonus = asset["data"]["gadget bonus"] ? parseFloat(asset["data"]["gadget bonus"]) : 0;

    let final = {};
    final["Base"] = parseFloat(first_mining_power) * parseFloat(genesis_multi);
    final["Full"] = (parseFloat(first_mining_power) * parseFloat(genesis_multi)) + parseFloat(gadget_bonus);
    return final;
  }
  function handleProduction (asset){
    let mine_count = 0;

    // asset["data"]["last claim"] is set to -2 when the NFTs are all fetched if the NFT does not have a asset["data"]["last claim"] attribute. 
    if (asset["data"]["last claim"] !== -2){
      mine_count = Math.floor((Date.now() * 0.001 - asset["data"]["last claim"]) / miningParams["mine_delay"]); //miningParams["mine_delay"]
      if (mine_count > parseFloat(miningParams["mine_cap"])){
        mine_count = parseFloat(miningParams["mine_cap"]);
      }
    }

    
    let emb_bonus = asset["data"]["embodiment bonus"] ? parseFloat(asset["data"]["embodiment bonus"]) : 1;

    let second_mining_power = handleMiningPower(asset);
    let schema_params = miningParams["allowed_schemas"][asset["schema"]["schema_name"]];
    let pool_pointer = miningParams[schema_params["pool"]];

    let token_power_pool = schema_params["pool"] === "BLKHL" ? pool_pointer["global_pool"] * 2 : pool_pointer["global_pool"];
    let safety_calc = second_mining_power["Full"] / token_power_pool > miningParams["safety"] ? miningParams["safety"] : second_mining_power["Full"] / token_power_pool;
    let quantity_calc = 1 / parseFloat(miningParams["schema_count"][schema_params["type"]]);

    let current_supply_pre = pool_pointer["Balance"];
    let current_supply_post = current_supply_pre;

    let owner_fee = 0;
    let helper_fee = 0;
    let mine_fee = 0;

    let base_token_yield = miningParams["balance_knob1"] * miningParams["balance_knob2"] * emb_bonus;
    let owner_yield_percentage = 1 - miningParams["mine_fee"] - miningParams["helper_fee"];

    let weight_main = schema_params["pool"] === "BLKHL" ? miningParams["powerpool_ratio"] : 1;
    let weight_slim = schema_params["pool"] === "BLKHL" ? (miningParams["powerpool_ratio"] - 1) * -1 : 0;

    for (let a = 0; a < mine_count; a++){
      let token_yield_main = base_token_yield * current_supply_post * safety_calc * weight_main;
      let token_yield_slim = base_token_yield * current_supply_post * quantity_calc * weight_slim;

      let token_yield_net = parseFloat(token_yield_main) + parseFloat(token_yield_slim);

      owner_fee += parseFloat(token_yield_net) * parseFloat(owner_yield_percentage);
      helper_fee += parseFloat(token_yield_net) * parseFloat(miningParams["helper_fee"]);
      mine_fee += parseFloat(token_yield_net) * parseFloat(miningParams["mine_fee"]);

      current_supply_post -= parseFloat(token_yield_net);
    }

    let theory_token_yield_main = base_token_yield * current_supply_pre * safety_calc * weight_main;
    let theory_token_yield_slim = base_token_yield * current_supply_pre * quantity_calc * weight_slim;

    let theory_token_yield_net = parseFloat(theory_token_yield_main) + parseFloat(theory_token_yield_slim);

    let theory_owner_fee = parseFloat(theory_token_yield_net) * parseFloat(owner_yield_percentage);

    let final = {};
    final["Owner"] = owner_fee;
    final["Helper"] = helper_fee;
    final["Mine"] = mine_fee;
    final["Count"] = mine_count;
    final["Pool"] = schema_params["pool"];
    final["Theory"] = theory_owner_fee;

    return final;


  }
