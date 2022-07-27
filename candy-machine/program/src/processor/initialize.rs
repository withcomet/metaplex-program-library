use anchor_lang::{prelude::*, Discriminator};
use mpl_token_metadata::state::{
    MAX_CREATOR_LIMIT, MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH, MAX_URI_LENGTH,
};
use spl_token::state::Mint;

use crate::{
    assert_initialized, assert_owned_by, cmp_pubkeys,
    constants::{CONFIG_ARRAY_START, CONFIG_LINE_SIZE},
    get_config_count, CandyError, CandyMachine, CandyMachineData, ConfigLine,
};

/// Create a new candy machine.
#[derive(Accounts)]
#[instruction(data: CandyMachineData)]
pub struct InitializeCandyMachine<'info> {
    /// CHECK: account constraints checked in account trait
    #[account(zero, rent_exempt = skip, constraint = candy_machine.to_account_info().owner == program_id && candy_machine.to_account_info().data_len() >= get_space_for_candy(data)?)]
    candy_machine: UncheckedAccount<'info>,
    /// CHECK: wallet can be any account and is not written to or read
    wallet: UncheckedAccount<'info>,
    /// CHECK: authority can be any account and is not written to or read
    authority: UncheckedAccount<'info>,
    payer: Signer<'info>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

pub fn handle_initialize_candy_machine(
    ctx: Context<InitializeCandyMachine>,
    data: CandyMachineData,
) -> Result<()> {
    let candy_machine_account = &mut ctx.accounts.candy_machine;

    if data.uuid.len() != 6 {
        return err!(CandyError::UuidMustBeExactly6Length);
    }

    let mut candy_machine = CandyMachine {
        data: data.clone(),
        authority: ctx.accounts.authority.key(),
        wallet: ctx.accounts.wallet.key(),
        token_mint: None,
        items_redeemed: 0,
    };

    if !ctx.remaining_accounts.is_empty() {
        let token_mint_info = &ctx.remaining_accounts[0];
        let _token_mint: Mint = assert_initialized(token_mint_info)?;
        let token_account: spl_token::state::Account = assert_initialized(&ctx.accounts.wallet)?;

        assert_owned_by(token_mint_info, &spl_token::id())?;
        assert_owned_by(&ctx.accounts.wallet, &spl_token::id())?;

        if !cmp_pubkeys(&token_account.mint, &token_mint_info.key()) {
            return err!(CandyError::MintMismatch);
        }

        candy_machine.token_mint = Some(*token_mint_info.key);
    }

    let mut array_of_zeroes = vec![];
    while array_of_zeroes.len() < MAX_SYMBOL_LENGTH - candy_machine.data.symbol.len() {
        array_of_zeroes.push(0u8);
    }
    let new_symbol =
        candy_machine.data.symbol.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
    candy_machine.data.symbol = new_symbol;

    // - 1 because we are going to be a creator
    if candy_machine.data.creators.len() > MAX_CREATOR_LIMIT - 1 {
        return err!(CandyError::TooManyCreators);
    }

    let mut new_data = CandyMachine::discriminator().try_to_vec().unwrap();
    new_data.append(&mut candy_machine.try_to_vec().unwrap());
    let mut cm_data = candy_machine_account.data.borrow_mut();
    // god forgive me couldnt think of better way to deal with this
    for i in 0..new_data.len() {
        cm_data[i] = new_data[i];
    }

    // only if we are not using hidden settings / comet sequel mint we will have space for
    // the config lines
    let sequel_mint = match candy_machine.data.comet_mint_settings {
        Some(cms) => cms.sequel_mint,
        None => false,
    };

    if candy_machine.data.hidden_settings.is_none() && !sequel_mint {
        let vec_start = CONFIG_ARRAY_START
            + 4
            + (candy_machine.data.items_available as usize) * CONFIG_LINE_SIZE;
        let as_bytes = (candy_machine
            .data
            .items_available
            .checked_div(8)
            .ok_or(CandyError::NumericalOverflowError)? as u32)
            .to_le_bytes();
        for i in 0..4 {
            cm_data[vec_start + i] = as_bytes[i]
        }
    }

    add_comet_config_lines(candy_machine_account.to_account_info(), data)
}

fn get_space_for_candy(data: CandyMachineData) -> Result<usize> {
    let sequel_mint = match data.comet_mint_settings {
        Some(cms) => cms.sequel_mint,
        None => false,
    };

    let num = if data.hidden_settings.is_some() || sequel_mint {
        CONFIG_ARRAY_START
    } else {
        CONFIG_ARRAY_START
            + 4
            + (data.items_available as usize) * CONFIG_LINE_SIZE
            + 8
            + 2 * ((data
                .items_available
                .checked_div(8)
                .ok_or(CandyError::NumericalOverflowError)?
                + 1) as usize)
    };

    Ok(num)
}

fn add_comet_config_lines(
    candy_machine_acc_info: AccountInfo,
    candy_machine_data: CandyMachineData,
) -> Result<()> {
    if let Some(cms) = &candy_machine_data.comet_mint_settings {
        if !cms.sequel_mint {
            let current_count = get_config_count(&candy_machine_acc_info.data.borrow_mut())?;
            let mut data = candy_machine_acc_info.data.borrow_mut();
            let index = 0;
            let mut fixed_config_lines =
                Vec::with_capacity(candy_machine_data.items_available as usize);

            for i in 0..candy_machine_data.items_available {
                let name = cms.name.clone() + " #" + &(i + 1).to_string();
                let array_of_zeroes = vec![0u8; MAX_NAME_LENGTH - name.len()];
                let config_line_name =
                    name.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();

                let uri = cms.uri.clone() + &(i + 1).to_string();
                let array_of_zeroes = vec![0u8; MAX_URI_LENGTH - uri.len()];
                let config_line_uri = uri.clone() + std::str::from_utf8(&array_of_zeroes).unwrap();
                fixed_config_lines.push(ConfigLine {
                    name: config_line_name,
                    uri: config_line_uri,
                })
            }

            let as_vec = fixed_config_lines.try_to_vec()?;
            // remove unneeded u32 because we're just gonna edit the u32 at the front
            let serialized: &[u8] = &as_vec.as_slice()[4..];

            let position = CONFIG_ARRAY_START + 4 + (index as usize) * CONFIG_LINE_SIZE;

            let array_slice: &mut [u8] =
                &mut data[position..position + fixed_config_lines.len() * CONFIG_LINE_SIZE];

            array_slice.copy_from_slice(serialized);

            let bit_mask_vec_start = CONFIG_ARRAY_START
                + 4
                + (candy_machine_data.items_available as usize) * CONFIG_LINE_SIZE
                + 4;

            let mut new_count = current_count;
            for i in 0..fixed_config_lines.len() {
                let position = (index as usize)
                    .checked_add(i)
                    .ok_or(CandyError::NumericalOverflowError)?;
                let my_position_in_vec = bit_mask_vec_start
                    + position
                        .checked_div(8)
                        .ok_or(CandyError::NumericalOverflowError)?;
                let position_from_right = 7 - position
                    .checked_rem(8)
                    .ok_or(CandyError::NumericalOverflowError)?;
                let mask = u8::pow(2, position_from_right as u32);

                let old_value_in_vec = data[my_position_in_vec];
                data[my_position_in_vec] |= mask;
                msg!(
                    "My position in vec is {} my mask is going to be {}, the old value is {}",
                    position,
                    mask,
                    old_value_in_vec
                );
                msg!(
                    "My new value is {} and my position from right is {}",
                    data[my_position_in_vec],
                    position_from_right
                );
                if old_value_in_vec != data[my_position_in_vec] {
                    msg!("Increasing count");
                    new_count = new_count
                        .checked_add(1)
                        .ok_or(CandyError::NumericalOverflowError)?;
                }
            }

            // plug in new count.
            data[CONFIG_ARRAY_START..CONFIG_ARRAY_START + 4]
                .copy_from_slice(&(new_count as u32).to_le_bytes());
        }
    }

    Ok(())
}
