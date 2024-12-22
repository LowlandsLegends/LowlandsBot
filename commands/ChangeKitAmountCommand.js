import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import RCONManager from '../rconmanager.js';

export class ChangeKitAmountCommand {

    constructor(allowedRoleId){
        this.name = 'changekitamount_eos';
        this.description = 'changes an kit amount of a player';
        this.requiredRoles = [allowedRoleId]; // requires a specific role
    }

    getSlashCommand() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption(option => 
                option
                    .setName('eos_id')
                    .setDescription('Either provide a EOSid')
                    .setRequired(true))
                    
            .addStringOption(option => 
                option
                    .setName('kit_name')
                    .setDescription('Specify the name of the kit you want to use')
                    .setRequired(true)
            )
            .addNumberOption(option =>
                option
                    .setName('amount')
                    .setDescription('Specify the Amount (negative numbers possible)')
                    .setRequired(true)
            )
    }
    /**
     * 
     * @param {RCONManager} rconmanager 
     */
    async execute(interaction, rconmanager){
        const eosID = interaction.options.getString('eos_id', true);
        const kitName = interaction.options.getString('kit_name', true);
        const amount = interaction.options.getNumber('amount', true);
        const serverIndex = 0;

        try {
            const command = `changekitamount ${eosID} ${kitName} ${amount}`
            const result = await rconmanager.executeRconCommand(serverIndex, command)
            if(!result.includes('Succes')){
                throw new Error(result)
            }
            const embed = new EmbedBuilder()
                .setTitle(`Succesfully ${amount > 0 ? 'increased' : 'decreased'} ${kitName} by ${amount} `)
                .setColor('Green')
                .addFields({
                    name: `command: \`${command}\``,
                    value: result.trim() === '' ? 'No output.' : `\`\`\`${result}\`\`\``
                })
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error Changing Kit amount (EOS-ID): ${error}`)

            const embed = new EmbedBuilder()
                .setTitle(`Error Changing ${kitName} Amount`)
                .setColor('#FF0000')
                .addFields({ name: 'Error Message', value: `\`\`\`${error.message}\`\`\`` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: false });
        }
    }
}