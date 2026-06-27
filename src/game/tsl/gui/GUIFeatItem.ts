import { GUIProtoItem, GUIButton } from "@/gui";
import type { GUIControl, GameMenu } from "@/gui";
import * as THREE from "three";
import { TextureType } from "@/enums/loaders/TextureType";
import { OdysseyTexture } from "@/three/odyssey/OdysseyTexture";
import type { GFFStruct } from "@/resource/GFFStruct";
import { GameState } from "@/GameState";
import { TextureLoader } from "@/loaders";

/**
 * GUIFeatItem class.
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file GUIFeatItem.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 */
export class GUIFeatItem extends GUIProtoItem {

  constructor(menu: GameMenu, control: GFFStruct, parent: GUIControl = null as any, scale = false){
    super(menu, control, parent, scale);
    this.disableSelection = true;
    this.extent.height = 45;
  }

  buildFill(){}
  buildBorder(){}
  buildHighlight(){}
  buildText(){}

  createControl(){
    try{
      super.createControl();
      //Create the actual control elements below

      let iconHeight = this.extent.height;
      let arrowHeight = iconHeight/2; //32

      let featList = this.node;
      for(let i = 0; i < featList.length; i++){
        let feat = featList[i];
        if(!feat) continue;

        let hasPrereqfeat1 = (feat.prereqfeat1 == '****' || GameState.getCurrentPlayer().getHasFeat(feat.prereqfeat1));
        let hasPrereqfeat2 = (feat.prereqfeat2 == '****' || GameState.getCurrentPlayer().getHasFeat(feat.prereqfeat2));
        let hasFeat = GameState.getCurrentPlayer().getHasFeat(feat.__index);

        let locked = !hasFeat || (!hasPrereqfeat1 || !hasPrereqfeat2);
        if(locked){ continue; }

        // Blank feat.2da rows (icon '****' or empty) have no art; skip them.
        const featIcon = feat.icon;
        if(!featIcon || featIcon === '****') continue;

        let buttonIcon = new GUIButton(this.menu, this.control, this, this.scale);
        buttonIcon.name = 'BUTTON';
        buttonIcon.setText('');
        buttonIcon.disableTextAlignment();
        buttonIcon.extent.width = iconHeight;
        buttonIcon.extent.height = iconHeight;
        buttonIcon.extent.top = 0;
        buttonIcon.extent.left = 0;
        buttonIcon.hasBorder = false;
        buttonIcon.hasHighlight = false;
        buttonIcon.hasText = false;
        buttonIcon.autoCalculatePosition = false;
        this.children.push(buttonIcon);

        let _buttonIconWidget = buttonIcon.createControl();
        switch(i){
          case 2:
            _buttonIconWidget.position.x = (this.extent.width/2 - buttonIcon.extent.width/2);
          break;
          case 1:
            _buttonIconWidget.position.x = 0;
          break;
          default:
            _buttonIconWidget.position.x = -(this.extent.width/2 - buttonIcon.extent.width/2);
          break;
        }
        _buttonIconWidget.position.y = 0;
        _buttonIconWidget.position.z = this.zIndex + 1;

        this.widget.add(_buttonIconWidget);

        // Default the frame materials invisible: TextureLoader only fires onLoad on
        // a successful load, so a missing texture must not leave the opaque-white
        // default material showing.
        const frameFill = buttonIcon.border.fill.material as THREE.ShaderMaterial;
        const frameHighlight = buttonIcon.highlight.fill.material as THREE.ShaderMaterial;
        frameFill.visible = false;
        frameHighlight.visible = false;
        TextureLoader.enQueue('uibit_abi_back', frameFill, TextureType.TEXTURE, (texture: OdysseyTexture) => {
          if(!texture) return;
          buttonIcon.setMaterialTexture(frameFill, texture);
          frameFill.transparent = true;
          buttonIcon.setMaterialTexture(frameHighlight, texture);
          frameHighlight.transparent = true;
          if(locked){
            (buttonIcon.getFill().material as THREE.ShaderMaterial).uniforms.opacity.value = 0.25;
          }
          this.invalidateListRtt(); // the listbox renders to an RTT; re-render once the frame loads
        });

        buttonIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          // Clicking a feat icon selects its row (fires the listbox onSelected).
          // Without this the icon's handler just swallows the click, leaving the
          // row unselectable.
          if(this.list){ this.list.select(this); }
        });

        /**
         * FEAT ICON
         */

        // Local refs (not this.widget.userData): a chained group builds several
        // icons in this loop and the shared userData fields were overwritten each
        // iteration, so every callback ended up targeting only the last sprite.
        const iconMaterial = new THREE.SpriteMaterial( { map: null, color: 0xffffff } );
        const iconSprite = new THREE.Sprite( iconMaterial );
        iconSprite.visible = false; // shown only once its texture actually loads

        iconSprite.scale.x = 32;
        iconSprite.scale.y = 32;
        iconSprite.position.z = 5;
        iconSprite.renderOrder = 5;
        TextureLoader.enQueue(featIcon, iconMaterial, TextureType.TEXTURE, (texture: OdysseyTexture) => {
          if(!texture) return;
          iconSprite.scale.x = texture.image.width;
          iconSprite.scale.y = texture.image.height;
          iconMaterial.opacity = locked ? 0.25 : 1.0;
          iconMaterial.transparent = true;
          iconMaterial.needsUpdate = true;
          iconSprite.visible = true;
          this.invalidateListRtt();
        });

        _buttonIconWidget.add(iconSprite);

        /**
         * BLUE ARROW
         */
        
        let arrowOffset = (this.extent.width/2 - buttonIcon.extent.width/2)/2;
        if(i > 0){
          let arrowIcon = new GUIButton(this.menu, this.control, this, this.scale);
          arrowIcon.name = 'ARROW';
          arrowIcon.setText('');
          arrowIcon.disableTextAlignment();
          arrowIcon.extent.width = arrowHeight;
          arrowIcon.extent.height = arrowHeight;
          arrowIcon.extent.top = 0;
          arrowIcon.extent.left = 0;
          arrowIcon.hasBorder = false;
          arrowIcon.hasHighlight = false;
          arrowIcon.disableBorder();
          arrowIcon.disableHighlight();
          arrowIcon.hasText = false;
          arrowIcon.autoCalculatePosition = false;
          this.children.push(arrowIcon);

          let _arrowIconWidget = arrowIcon.createControl();
          switch(i){
            case 2:
              _arrowIconWidget.position.x = arrowOffset;
            break;
            case 1:
              _arrowIconWidget.position.x = -arrowOffset;
            break;
          }
          _arrowIconWidget.position.y = 0;
          _arrowIconWidget.position.z = this.zIndex + 1;

          this.widget.add(_arrowIconWidget);

          const arrowFill = arrowIcon.border.fill.material as THREE.ShaderMaterial;
          const arrowHighlight = arrowIcon.highlight.fill.material as THREE.ShaderMaterial;
          arrowFill.visible = false;
          arrowHighlight.visible = false;
          TextureLoader.enQueue('uibit_abi_arrow', arrowFill, TextureType.TEXTURE, (texture: OdysseyTexture) => {
            if(!texture) return;
            arrowIcon.setMaterialTexture(arrowFill, texture);
            arrowFill.transparent = true;
            arrowIcon.setMaterialTexture(arrowHighlight, texture);
            arrowHighlight.transparent = true;
            if(locked){
              arrowFill.uniforms.opacity.value = 0.25;
              arrowHighlight.uniforms.opacity.value = 0.25;
            }
            this.invalidateListRtt();
          });
        }

      }
      return this.widget;
    }catch(e){
      console.error(e);
    }
    return this.widget;

  }

}