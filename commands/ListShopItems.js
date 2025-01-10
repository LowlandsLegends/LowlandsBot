import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import RCONManager from '../rconmanager.js';

export class ListShopItems {
    constructor() {
        this.name = 'ListShopItems';
        this.description = 'Lists All Shop Items and available kits';
    }

    getSlashCommand(){
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
    }

    async execute(interaction){
        
    }
}
